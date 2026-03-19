import { clearDriveToken, ensureDriveToken } from './googleDriveAuth';
import { auth as firebaseAuth, db } from './firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

function isDriveDebugEnabled(): boolean {
  try {
    return window.localStorage?.getItem('xpdf:drive:debug') === '1' || Boolean((import.meta as any).env?.DEV);
  } catch {
    return false;
  }
}

function dlog(...args: any[]) {
  if (!isDriveDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[drive-api]', ...args);
}

function makeDriveError(code: string, message: string): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

function resolveFirebaseUid(explicitUid?: string | null): string {
  const u = (explicitUid ?? '').trim();
  if (u) return u;

  const current = firebaseAuth?.currentUser?.uid;
  if (typeof current === 'string' && current.trim()) return current.trim();

  throw makeDriveError('drive/no_firebase_user', 'Please sign in to the app to use Drive sync.');
}

function requireFirestore() {
  if (!db) {
    throw makeDriveError('drive/no_firestore', 'Firebase/Firestore is not configured.');
  }
  return db;
}

export type DriveFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

const FOLDER_NAME = 'pdfstudio-tech';

function readEnvApiKey(): string | null {
  const key = (import.meta as any).env?.VITE_GOOGLE_API_KEY as string | undefined;
  return key && key.trim().length > 0 ? key.trim() : null;
}

async function authHeader(interactive: boolean): Promise<string> {
  const token = await ensureDriveToken(interactive);
  if (!token) throw new Error('Not signed in to Google Drive');
  return `Bearer ${token}`;
}

function apiKeyParam(): string {
  const key = readEnvApiKey();
  // NOTE: All requests in this module are authenticated via OAuth (Bearer token).
  // Including an API key can *break* otherwise-valid OAuth requests when the key is
  // restricted (common in production), returning 403 PERMISSION_DENIED.
  // Keep the hook for debugging, but disable by default.
  const allow = false;
  return key && allow ? `&key=${encodeURIComponent(key)}` : '';
}

async function readGoogleApiError(res: Response): Promise<{ message?: string; reason?: string; status?: string }> {
  try {
    const data = (await res.json()) as any;
    const message = typeof data?.error?.message === 'string' ? data.error.message : undefined;
    const status = typeof data?.error?.status === 'string' ? data.error.status : undefined;
    const reason = Array.isArray(data?.error?.errors) && typeof data.error.errors?.[0]?.reason === 'string'
      ? String(data.error.errors[0].reason)
      : undefined;
    return { message, reason, status };
  } catch {
    return {};
  }
}

async function throwDriveHttpError(prefix: string, res: Response): Promise<never> {
  const details = await readGoogleApiError(res);
  const extra = [details.status, details.reason, details.message].filter(Boolean).join(' | ');
  const msg = extra ? `${prefix} (${res.status}): ${extra}` : `${prefix} (${res.status})`;
  const err: any = makeDriveError('drive/http_error', msg);
  err.status = res.status;
  err.google = details;
  throw err;
}

async function readDriveFolderIdFromFirestore(uid: string): Promise<string | null> {
  const firestore = requireFirestore();
  const snap = await getDoc(doc(firestore, 'users', uid));
  const data = snap.exists() ? (snap.data() as any) : null;
  const folderId = typeof data?.drive?.folderId === 'string' ? String(data.drive.folderId).trim() : '';
  return folderId ? folderId : null;
}

async function readDriveStateFromFirestore(uid: string): Promise<{ folderId: string | null; driveUserEmail?: string }> {
  const firestore = requireFirestore();
  const snap = await getDoc(doc(firestore, 'users', uid));
  const data = snap.exists() ? (snap.data() as any) : null;
  const folderId = typeof data?.drive?.folderId === 'string' ? String(data.drive.folderId).trim() : '';
  const driveUserEmail = typeof data?.drive?.driveUserEmail === 'string' ? String(data.drive.driveUserEmail).trim() : '';
  return {
    folderId: folderId ? folderId : null,
    driveUserEmail: driveUserEmail ? driveUserEmail : undefined,
  };
}

async function clearDriveFolderIdInFirestore(uid: string): Promise<void> {
  const firestore = requireFirestore();
  await setDoc(
    doc(firestore, 'users', uid),
    { drive: { folderId: null } },
    { merge: true },
  );
}

async function writeDriveFolderIdToFirestore(params: {
  uid: string;
  folderId: string | null;
  driveUserEmail?: string;
}): Promise<void> {
  const firestore = requireFirestore();

  const drive: any = {
    folderId: params.folderId,
    folderName: FOLDER_NAME,
    connectedAt: new Date().toISOString(),
    scopes: ['drive.file'],
  };
  const email = typeof params.driveUserEmail === 'string' ? params.driveUserEmail.trim() : '';
  if (email) drive.driveUserEmail = email;

  await setDoc(
    doc(firestore, 'users', params.uid),
    { drive },
    { merge: true },
  );
}

async function driveFetch(url: string, init?: RequestInit, interactive = true): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: await authHeader(interactive),
    },
  });

  // If the user revoked access, token expired server-side, or the account changed,
  // Google returns 401 even if we think our token is still "non-expired".
  // Clear the cached token so the next click-driven action can re-auth cleanly.
  if (res.status === 401) {
    try {
      clearDriveToken();
    } catch {
      // ignore
    }
    dlog('driveFetch: unauthorized (401); cleared cached token', { url });
    throw makeDriveError('drive/unauthorized', 'Google Drive authorization expired. Please sign in again.');
  }

  // If the token doesn't include Drive scopes, Google returns 403 with a message about
  // insufficient authentication scopes. Clear cached token so the next click-driven
  // connect flow can re-consent.
  if (res.status === 403) {
    let details: { message?: string; reason?: string; status?: string } = {};
    try {
      details = await readGoogleApiError(res.clone());
    } catch {
      details = {};
    }

    const reason = (details.reason ?? '').toLowerCase();
    const message = (details.message ?? '').toLowerCase();
    if (reason.includes('insufficient') || message.includes('insufficient authentication scopes')) {
      try {
        clearDriveToken();
      } catch {
        // ignore
      }
      dlog('driveFetch: insufficient scopes (403); cleared cached token', { url, details });
      const err: any = makeDriveError(
        'drive/insufficient_scopes',
        'Google Drive permission is missing. Please sign in again and allow Drive access.',
      );
      err.status = 403;
      err.google = details;
      throw err;
    }
  }
  return res;
}

export async function getFileMetadata(fileId: string, params?: { interactive?: boolean }): Promise<any> {
  const fields = encodeURIComponent('id,name,mimeType,modifiedTime,size,parents');
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}${apiKeyParam()}`;
  const res = await driveFetch(url, undefined, params?.interactive ?? true);
  if (!res.ok) {
    const status = res.status;
    let code = 'drive/http_error';
    if (status === 404) code = 'drive/not_found';
    else if (status === 403) code = 'drive/forbidden';
    else if (status === 400) code = 'drive/bad_request';
    const err: any = makeDriveError(code, `Drive metadata failed (${status})`);
    err.status = status;
    throw err;
  }
  return await res.json();
}

function escapeDriveQueryStringLiteral(value: string): string {
  // Google Drive query strings use single quotes for string literals.
  // Escape any embedded single quotes.
  return value.replace(/'/g, "\\'");
}

async function findExistingAppFolder(interactive: boolean): Promise<string | null> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryStringLiteral(FOLDER_NAME)}' and trashed=false`,
  );
  const fields = encodeURIComponent('files(id,name,mimeType)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=10${apiKeyParam()}`;
  const res = await driveFetch(url, undefined, interactive);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const files = (data?.files ?? []) as any[];
  const f = files.find((x) => x?.id && x?.mimeType === 'application/vnd.google-apps.folder');
  return f?.id ? String(f.id) : null;
}

async function createAppFolder(interactive: boolean): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files?fields=id${apiKeyParam()}`;
  const body = {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['root'],
  };
  const res = await driveFetch(
    url,
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    },
    interactive,
  );
  if (!res.ok) await throwDriveHttpError('Drive folder create failed', res);
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error('Drive folder create returned no id');
  return String(data.id);
}

async function ensureAppFolderId(params: {
  interactive: boolean;
  uid: string;
  driveUserEmail?: string;
}): Promise<string> {
  const { interactive, uid, driveUserEmail } = params;

  const state = await readDriveStateFromFirestore(uid);
  const stored = state.folderId;

  // If the Firebase user stays the same but the Google account changes,
  // the stored folderId will be inaccessible (404). Proactively clear it.
  const storedEmail = (state.driveUserEmail ?? '').trim().toLowerCase();
  const currentEmail = (driveUserEmail ?? '').trim().toLowerCase();
  if (stored && storedEmail && currentEmail && storedEmail !== currentEmail) {
    dlog('ensureAppFolderId: stored driveUserEmail mismatch; clearing stored folderId', {
      uid,
      storedEmail,
      currentEmail,
    });
    try {
      await clearDriveFolderIdInFirestore(uid);
    } catch {
      // ignore
    }
  }

  const storedAfterMismatchClear = await readDriveFolderIdFromFirestore(uid);
  const storedId = storedAfterMismatchClear;
  if (storedId) {
    try {
      const meta = await getFileMetadata(storedId, { interactive });
      if (meta?.mimeType === 'application/vnd.google-apps.folder') {
        return storedId;
      }
    } catch (e) {
      const anyErr = e as any;
      const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;
      const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
      dlog('ensureAppFolderId: stored folder invalid', {
        uid,
        folderId: storedId,
        status,
        code,
        err: e instanceof Error ? e.message : String(e),
      });

      // If the folder truly doesn't exist (or is forbidden), clear it so we don't
      // repeatedly hit a 404 on every app boot.
      if (status === 404 || status === 403 || code === 'drive/not_found' || code === 'drive/forbidden') {
        try {
          await clearDriveFolderIdInFirestore(uid);
        } catch {
          // ignore
        }
      }
    }

    // Folder is missing/inaccessible (or account mismatch).
    // If we already have a cached token, we can fix this without prompting.
    // `interactive=false` only means "never open a popup", not "never call Drive APIs".
    // If token acquisition is required, driveFetch/authHeader will fail fast.

    const existing = await findExistingAppFolder(interactive);
    if (existing) {
      await writeDriveFolderIdToFirestore({ uid, folderId: existing, driveUserEmail });
      return existing;
    }

    const created = await createAppFolder(interactive);
    await writeDriveFolderIdToFirestore({ uid, folderId: created, driveUserEmail });
    return created;
  }

  // First-time: if we have a cached token we can initialize without prompting.
  // If we *don't* have a cached token, driveFetch/authHeader will throw and the UI
  // can ask the user to click "Sign in with Google".

  const existing = await findExistingAppFolder(interactive);
  if (existing) {
    await writeDriveFolderIdToFirestore({ uid, folderId: existing, driveUserEmail });
    return existing;
  }

  const created = await createAppFolder(interactive);
  await writeDriveFolderIdToFirestore({ uid, folderId: created, driveUserEmail });
  return created;
}

export async function listFiles(params?: { pageSize?: number; interactive?: boolean; uid?: string; driveUserEmail?: string }): Promise<DriveFileSummary[]> {
  const interactive = params?.interactive ?? true;
  const uid = resolveFirebaseUid(params?.uid ?? null);
  const folderId = await ensureAppFolderId({ interactive, uid, driveUserEmail: params?.driveUserEmail });
  const pageSize = Math.max(1, Math.min(200, Number(params?.pageSize ?? 30)));

  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
  const orderBy = encodeURIComponent('modifiedTime desc');

  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=${orderBy}&pageSize=${pageSize}${apiKeyParam()}`;
  const res = await driveFetch(url, undefined, interactive);
  if (!res.ok) await throwDriveHttpError('Drive list failed', res);
  const data = (await res.json()) as any;

  const files = (data?.files ?? []) as any[];
  return files
    .map((f) => ({
      id: String(f.id),
      name: String(f.name ?? ''),
      mimeType: 'application/pdf',
      modifiedTime: typeof f.modifiedTime === 'string' ? f.modifiedTime : undefined,
      size: typeof f.size === 'string' ? f.size : undefined,
    }))
    .filter((f) => f.id && f.name);
}

function buildMultipartBody(params: { metadata: any; blob: Blob; boundary: string }): Blob {
  const { metadata, blob, boundary } = params;

  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;

  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${blob.type || 'application/pdf'}\r\n\r\n`;

  const end = `\r\n--${boundary}--`;

  return new Blob([metaPart, fileHeader, blob, end], { type: `multipart/related; boundary=${boundary}` });
}

export async function createFile(params: { name: string; blob: Blob; uid?: string; driveUserEmail?: string }): Promise<{ id: string }> {
  const uid = resolveFirebaseUid(params.uid ?? null);
  const folderId = await ensureAppFolderId({ interactive: true, uid, driveUserEmail: params.driveUserEmail });
  const boundary = `xpdf-${Math.random().toString(16).slice(2)}`;
  const metadata = {
    name: params.name,
    mimeType: 'application/pdf',
    parents: [folderId],
  };

  const body = buildMultipartBody({ metadata, blob: params.blob, boundary });

  const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id${apiKeyParam()}`;
  const res = await driveFetch(
    url,
    {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    },
    true,
  );
  if (!res.ok) await throwDriveHttpError('Drive create failed', res);
  const data = (await res.json()) as any;
  return { id: String(data?.id) };
}

export async function updateFile(params: { fileId: string; blob: Blob; uid?: string; driveUserEmail?: string }): Promise<void> {
  const uid = resolveFirebaseUid(params.uid ?? null);
  // Ensure the app folder exists (and is stored) before updating.
  await ensureAppFolderId({ interactive: true, uid, driveUserEmail: params.driveUserEmail });
  const boundary = `xpdf-${Math.random().toString(16).slice(2)}`;
  const metadata = {
    mimeType: 'application/pdf',
  };

  const body = buildMultipartBody({ metadata, blob: params.blob, boundary });

  const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
    params.fileId,
  )}?uploadType=multipart${apiKeyParam()}`;

  const res = await driveFetch(
    url,
    {
    method: 'PATCH',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    },
    true,
  );
  if (!res.ok) await throwDriveHttpError('Drive update failed', res);
}

export async function deleteFile(fileId: string): Promise<void> {
  // Best-effort: ensure folder is initialized for this user.
  const uid = resolveFirebaseUid(null);
  await ensureAppFolderId({ interactive: true, uid });
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}${apiKeyParam()}`;
  const res = await driveFetch(url, { method: 'DELETE' }, true);
  if (!res.ok) await throwDriveHttpError('Drive delete failed', res);
}

export async function downloadFile(
  fileId: string,
  options?: {
    onProgress?: (p: { loaded: number; total?: number }) => void;
    signal?: AbortSignal;
  },
): Promise<Blob> {
  // Best-effort: ensure folder is initialized for this user.
  const uid = resolveFirebaseUid(null);
  await ensureAppFolderId({ interactive: true, uid });
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media${apiKeyParam()}`;
  const res = await driveFetch(url, { signal: options?.signal }, true);
  if (!res.ok) await throwDriveHttpError('Drive download failed', res);

  const onProgress = options?.onProgress;
  if (!onProgress) {
    return await res.blob();
  }

  const totalRaw = res.headers.get('Content-Length');
  const totalN = totalRaw != null ? Number(totalRaw) : NaN;
  const total = Number.isFinite(totalN) && totalN > 0 ? totalN : undefined;

  // If streaming isn't available, fall back to blob() and report once.
  const body: any = (res as any).body;
  if (!body || typeof body.getReader !== 'function') {
    const blob = await res.blob();
    try {
      onProgress({ loaded: blob.size, total: total ?? blob.size });
    } catch {
      // ignore
    }
    return blob;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    onProgress({ loaded, total });
  } catch {
    // ignore
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      try {
        onProgress({ loaded, total });
      } catch {
        // ignore
      }
    }
  }

  const type = res.headers.get('Content-Type') || 'application/pdf';
  return new Blob(chunks, { type });
}
