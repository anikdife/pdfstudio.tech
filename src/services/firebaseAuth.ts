// src/services/firebaseAuth.ts
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCredential,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, firebaseEnabled } from './firebaseClient';

const FIREBASE_GIS_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

// Overall timeout for the whole popup/token flow (weak networks supported)
const GIS_TIMEOUT_MS = 120_000;

// After popup closes, keep checking for a while because storage/BC can be delayed on Edge/COOP+COEP
const CLOSED_GRACE_MS = 12_000;

// Poll localStorage as last-resort transport (works across browsing-context-group boundaries)
const POLL_MS = 250;

export type FirebaseIdentity = {
  uid: string | null;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isLoggedIn: boolean;
};

export type FirebaseGoogleSignInResult = {
  identity: FirebaseIdentity;
  /** Google OAuth access token (if available) */
  googleAccessToken?: string;
  /** Best-effort expiry timestamp (epoch ms) */
  expiresAt?: number;
};

function toIdentity(user: User | null): FirebaseIdentity {
  if (!user) {
    return {
      uid: null,
      displayName: null,
      email: null,
      photoURL: null,
      isLoggedIn: false,
    };
  }
  return {
    uid: user.uid,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    isLoggedIn: true,
  };
}

function requireFirebaseAuth() {
  if (!firebaseEnabled || !auth) {
    throw new Error('Firebase is not configured (missing VITE_FIREBASE_* env vars).');
  }
  return auth;
}

function readGisClientIdOrNull(): string | null {
  try {
    // Reuse the same OAuth client id already used for Drive.
    const raw = (import.meta as any).env?.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

function openCenteredPopup(url: string): Window | null {
  const w = 520;
  const h = 640;
  const dualScreenLeft = (window as any).screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = (window as any).screenTop ?? window.screenY ?? 0;
  const width = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const height = window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;
  const left = Math.max(0, Math.floor(width / 2 - w / 2 + dualScreenLeft));
  const top = Math.max(0, Math.floor(height / 2 - h / 2 + dualScreenTop));
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener=false,noreferrer=false`;
  return window.open(url, 'xpdf-firebase-auth', features);
}

type BridgeAuthResponse =
  | { type: 'xpdf-drive-auth-success'; req: string; accessToken: string; expiresIn: number | null }
  | { type: 'xpdf-drive-auth-error'; req: string; error: string }
  | { type: 'xpdf-drive-auth-cancel'; req: string; error: string };

function createReqId(): string {
  try {
    const c: any = globalThis as any;
    if (typeof c?.crypto?.randomUUID === 'function') return String(c.crypto.randomUUID());
  } catch {
    // ignore
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function buildBridgeUrl(options?: { prompt?: '' | 'consent' | 'select_account'; loginHint?: string }): URL {
  const clientId = readGisClientIdOrNull();
  if (!clientId) throw new Error('Missing VITE_GOOGLE_DRIVE_CLIENT_ID (required for Google sign-in)');

  const req = createReqId();
  const prompt = (options?.prompt ?? 'select_account') as any;

  const u = new URL('/auth/drive.html', window.location.href);
  u.searchParams.set('mode', 'firebase');
  u.searchParams.set('req', req);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('scope', FIREBASE_GIS_SCOPES.join(' '));
  u.searchParams.set('prompt', prompt);
  // login_hint currently not consumed by drive.html; safe to omit.

  return u;
}

async function requestGoogleAccessTokenViaBridge(options?: {
  prompt?: '' | 'consent' | 'select_account';
  loginHint?: string;
}): Promise<{ accessToken: string; expiresIn: number | null }> {
  const bridgeUrl = buildBridgeUrl(options);
  const req = bridgeUrl.searchParams.get('req') || '';
  const LS_KEY = `xpdf:drive:auth:bridge:${req}`;

  const bc = new BroadcastChannel('xpdf:drive:auth');

  let popup: Window | null = null;
  let timeoutId: number | null = null;
  let pollId: number | null = null;
  let closedGraceId: number | null = null;

  const parseMsg = (raw: string | null): BridgeAuthResponse | null => {
    if (!raw) return null;
    try {
      const msg = JSON.parse(raw) as any;
      if (!msg || msg.req !== req || typeof msg.type !== 'string') return null;
      return msg as BridgeAuthResponse;
    } catch {
      return null;
    }
  };

  const cleanup = (removeStorageListener: (fn: any) => void, storageListener: any) => {
    if (timeoutId != null) window.clearTimeout(timeoutId);
    timeoutId = null;

    if (pollId != null) window.clearInterval(pollId);
    pollId = null;

    if (closedGraceId != null) window.clearTimeout(closedGraceId);
    closedGraceId = null;

    try {
      bc.close();
    } catch {
      // ignore
    }

    try {
      removeStorageListener(storageListener);
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }

    try {
      popup?.close();
    } catch {
      // ignore
    }
    popup = null;
  };

  return await new Promise((resolve, reject) => {
    const finishWithError = (err: any, removeStorageListener: (fn: any) => void, storageListener: any) => {
      cleanup(removeStorageListener, storageListener);
      reject(err);
    };

    const finishWithSuccess = (
      accessToken: string,
      expiresIn: number | null,
      removeStorageListener: (fn: any) => void,
      storageListener: any,
    ) => {
      cleanup(removeStorageListener, storageListener);
      resolve({ accessToken, expiresIn });
    };

    const handleMsg = (
      msg: BridgeAuthResponse,
      removeStorageListener: (fn: any) => void,
      storageListener: any,
    ) => {
      if (!msg || (msg as any).req !== req) return;

      if (msg.type === 'xpdf-drive-auth-success') {
        const accessToken = String((msg as any).accessToken || '').trim();
        const expiresInRaw = (msg as any).expiresIn;
        const expiresIn = Number.isFinite(expiresInRaw) ? Number(expiresInRaw) : null;

        if (!accessToken) {
          const e = new Error('Google sign-in returned no access token');
          (e as any).code = 'google/no_access_token';
          finishWithError(e, removeStorageListener, storageListener);
          return;
        }

        finishWithSuccess(accessToken, expiresIn, removeStorageListener, storageListener);
        return;
      }

      if (msg.type === 'xpdf-drive-auth-cancel') {
        const e: any = new Error('Sign-in popup was closed or blocked.');
        e.code = 'popup_closed_by_user';
        finishWithError(e, removeStorageListener, storageListener);
        return;
      }

      if (msg.type === 'xpdf-drive-auth-error') {
        const e: any = new Error(String((msg as any).error || 'Google sign-in failed'));
        e.code = 'google/auth_failed';
        finishWithError(e, removeStorageListener, storageListener);
      }
    };

    const onMessage = (ev: MessageEvent) => {
      try {
        if (ev.origin !== window.location.origin) return;
        const msg = ev.data as BridgeAuthResponse;
        if (!msg || (msg as any).req !== req) return;
        // removeStorageListener is a no-op here; message path doesn't require it.
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMessage);

    // Storage listener needs to be removable via the same reference.
    const storageListener = (e: StorageEvent) => {
      if (e.key !== LS_KEY || !e.newValue) return;
      const msg = parseMsg(e.newValue);
      if (!msg) return;
      handleMsg(msg, (fn) => window.removeEventListener('storage', fn as any), storageListener);
    };
    window.addEventListener('storage', storageListener as any);

    const removeStorageListener = (fn: any) => window.removeEventListener('storage', fn as any);

    // BroadcastChannel (fast path)
    bc.onmessage = (ev) => {
      const msg = ev.data as BridgeAuthResponse;
      if (!msg || (msg as any).req !== req) return;
      handleMsg(msg, removeStorageListener, storageListener);
    };

    // Same-origin postMessage from popup (fallback)
    const onPopupPostMessage = (ev: MessageEvent) => {
      try {
        if (ev.origin !== window.location.origin) return;
        const msg = ev.data as BridgeAuthResponse;
        if (!msg || (msg as any).req !== req) return;
        handleMsg(msg, removeStorageListener, storageListener);
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onPopupPostMessage);

    timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onPopupPostMessage);
      const e: any = new Error('Google sign-in timed out. Check popup blockers and try again.');
      e.code = 'google/auth_timeout';
      finishWithError(e, removeStorageListener, storageListener);
    }, GIS_TIMEOUT_MS);

    // IMPORTANT: open popup synchronously
    popup = openCenteredPopup(bridgeUrl.toString());
    if (!popup) {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onPopupPostMessage);
      const e: any = new Error('Popup was blocked. Please allow popups and try again.');
      e.code = 'popup_blocked';
      finishWithError(e, removeStorageListener, storageListener);
      return;
    }

    // Poll localStorage as last resort (works even if BC/message are delayed)
    pollId = window.setInterval(() => {
      try {
        const msg = parseMsg(localStorage.getItem(LS_KEY));
        if (msg) {
          handleMsg(msg, removeStorageListener, storageListener);
          return;
        }
      } catch {
        // ignore
      }

      if (!popup) return;

      // If the popup is closed, keep checking for CLOSED_GRACE_MS
      if (popup.closed) {
        if (pollId != null) window.clearInterval(pollId);
        pollId = null;

        const started = Date.now();

        const checkAfterClose = () => {
          try {
            const msg = parseMsg(localStorage.getItem(LS_KEY));
            if (msg) {
              handleMsg(msg, removeStorageListener, storageListener);
              return;
            }
          } catch {
            // ignore
          }

          if (Date.now() - started < CLOSED_GRACE_MS) {
            closedGraceId = window.setTimeout(checkAfterClose, POLL_MS);
            return;
          }

          window.removeEventListener('message', onMessage);
          window.removeEventListener('message', onPopupPostMessage);

          const e: any = new Error('Sign-in popup was closed or blocked.');
          e.code = 'popup_closed_by_user';
          finishWithError(e, removeStorageListener, storageListener);
        };

        closedGraceId = window.setTimeout(checkAfterClose, POLL_MS);
      }
    }, POLL_MS);
  });
}

let persistenceEnsured = false;
async function ensureFirebasePersistence(): Promise<void> {
  if (!firebaseEnabled || !auth) return;
  if (persistenceEnsured) return;
  persistenceEnsured = true;

  try {
    await setPersistence(auth, browserLocalPersistence);
    return;
  } catch {
    // fall through
  }

  try {
    await setPersistence(auth, browserSessionPersistence);
    return;
  } catch {
    // fall through
  }

  try {
    await setPersistence(auth, inMemoryPersistence);
  } catch {
    // ignore
  }
}

export async function completeFirebaseRedirectSignIn(): Promise<{
  result: FirebaseGoogleSignInResult | null;
  error: Error | null;
}> {
  if (!firebaseEnabled || !auth) return { result: null, error: null };
  await ensureFirebasePersistence();

  try {
    const result = await getRedirectResult(auth);
    if (!result?.user) return { result: null, error: null };
    const credential = GoogleAuthProvider.credentialFromResult(result) as any;
    const googleAccessToken = typeof credential?.accessToken === 'string' ? credential.accessToken : undefined;
    const expiresAt = googleAccessToken ? Date.now() + 55 * 60 * 1000 : undefined;
    return { result: { identity: toIdentity(result.user), googleAccessToken, expiresAt }, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error('Firebase redirect sign-in failed');
    return { result: null, error: err };
  }
}

export async function signInToFirebaseWithGoogleAccessToken(accessToken: string): Promise<FirebaseGoogleSignInResult> {
  const firebaseAuth = requireFirebaseAuth();
  await ensureFirebasePersistence();

  const token = (accessToken || '').trim();
  if (!token) throw new Error('Missing Google access token');

  // Note: GoogleAuthProvider.credential(idToken, accessToken)
  const credential = GoogleAuthProvider.credential(null, token);
  const result = await signInWithCredential(firebaseAuth, credential);

  const expiresAt = Date.now() + 55 * 60 * 1000;
  return {
    identity: toIdentity(result.user),
    googleAccessToken: token,
    expiresAt,
  };
}

/**
 * OPTION A (robust): Use the /auth/drive.html GIS token bridge to obtain an access token,
 * then sign into Firebase using signInWithCredential.
 *
 * This avoids Firebase redirect flows (which can break under COOP/COEP / storage constraints).
 */
export async function signInWithGoogleFirebase(options?: {
  scopes?: string[];
  prompt?: string;
  loginHint?: string;
}): Promise<FirebaseGoogleSignInResult> {
  requireFirebaseAuth();

  // IMPORTANT: do not await anything before opening the popup.
  // requestGoogleAccessTokenViaBridge opens the popup synchronously.
  const promptRaw = typeof options?.prompt === 'string' ? options.prompt.trim() : 'select_account';
  const prompt =
    promptRaw === 'consent' || promptRaw === 'select_account' || promptRaw === '' ? (promptRaw as any) : ('select_account' as any);

  const { accessToken, expiresIn } = await requestGoogleAccessTokenViaBridge({
    prompt,
    loginHint: typeof options?.loginHint === 'string' ? options.loginHint.trim() : undefined,
  });

  const res = await signInToFirebaseWithGoogleAccessToken(accessToken);

  // Prefer bridge expiresIn if present (more accurate than 55m guess)
  if (expiresIn && Number.isFinite(expiresIn) && expiresIn > 0) {
    res.expiresAt = Date.now() + Math.floor(expiresIn * 1000);
  }

  return res;
}

// Kept for compatibility; not used by Option A path.
export function startGoogleFirebaseRedirect(options?: { scopes?: string[]; prompt?: string; loginHint?: string }): void {
  const firebaseAuth = requireFirebaseAuth();

  const provider = new GoogleAuthProvider();
  const prompt = typeof options?.prompt === 'string' ? String(options.prompt) : 'select_account';
  const loginHint = typeof options?.loginHint === 'string' ? String(options.loginHint).trim() : '';
  const params: Record<string, string> = { prompt: prompt || 'select_account' };
  if (loginHint) params.login_hint = loginHint;
  provider.setCustomParameters(params);

  for (const scope of options?.scopes ?? []) {
    if (typeof scope === 'string' && scope.trim()) provider.addScope(scope.trim());
  }

  void signInWithRedirect(firebaseAuth, provider);
}

export async function signOutFromFirebase(): Promise<void> {
  if (!firebaseEnabled || !auth) return;
  await ensureFirebasePersistence();
  await signOut(auth);
}

export function onAuthStateChangedListener(callback: (identity: FirebaseIdentity) => void): () => void {
  if (!firebaseEnabled || !auth) {
    callback(toIdentity(null));
    return () => {};
  }

  let unsub: (() => void) | null = null;
  let cancelled = false;

  (async () => {
    try {
      await ensureFirebasePersistence();
    } catch {
      // ignore
    }
    if (cancelled) return;

    unsub = onAuthStateChanged(auth, (user) => {
      callback(toIdentity(user));
    });
  })();

  return () => {
    cancelled = true;
    try {
      unsub?.();
    } catch {
      // ignore
    }
    unsub = null;
  };
}
