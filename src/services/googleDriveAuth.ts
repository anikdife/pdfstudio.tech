// src/services/googleDriveAuth.ts

type StoredToken = {
  accessToken: string;
  expiresAt?: number; // epoch ms
  obtainedAt?: number; // epoch ms (best-effort when expiresAt is unknown)
  scopeVersion?: number;
};

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
  console.log('[drive-auth]', ...args);
}

function maskClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 8) return '***';
  return `***${trimmed.slice(-6)}`;
}

export function getDriveAuthDiagnostics(): {
  hasGoogleOauth2: boolean;
  hasTokenClient: boolean;
  hasInMemoryToken: boolean;
  isNonExpiredToken: boolean;
  scopeVersion: number;
  envHasClientId: boolean;
  envClientIdMask: string | null;
} {
  let envClientIdMask: string | null = null;
  let envHasClientId = false;
  try {
    const raw = (import.meta as any).env?.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    envHasClientId = Boolean(trimmed);
    envClientIdMask = trimmed ? maskClientId(trimmed) : null;
  } catch {
    // ignore
  }

  const g = (window as any).google;
  const hasGoogleOauth2 = Boolean(g?.accounts?.oauth2);
  return {
    hasGoogleOauth2,
    hasTokenClient: Boolean(tokenClient),
    hasInMemoryToken: Boolean(inMemoryToken?.accessToken),
    isNonExpiredToken: isNonExpired(inMemoryToken),
    scopeVersion: SCOPE_VERSION,
    envHasClientId,
    envClientIdMask,
  };
}

// v2: scope set expanded beyond drive.file; force re-consent by changing storage keys.
// v3: scope set reduced to drive.file; force re-consent by changing storage keys.
const DRIVE_TOKEN_KEY = 'pdfstudio.driveAccessToken.v3';
const DRIVE_TOKEN_EXPIRES_KEY = 'pdfstudio.driveAccessTokenExpiresAt.v3';
const DRIVE_TOKEN_OBTAINED_KEY = 'pdfstudio.driveAccessTokenObtainedAt.v3';
const DRIVE_TOKEN_SCOPEVER_KEY = 'pdfstudio.driveAccessTokenScopeVer.v3';

// Least-privilege: restrict Drive access to files the app creates/opens.
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// Bump this whenever scopes meaningfully change.
const SCOPE_VERSION = 4;

let gisLoadPromise: Promise<void> | null = null;
let tokenClient: any | null = null;
let inMemoryToken: StoredToken | null = null;
let requestInFlight: Promise<string> | null = null;

const AUTH_TIMEOUT_MS = 60_000;

/**
 * Messages emitted by /auth/drive.html back to the opener window.
 * NOTE: single definition only (prevents TS "Duplicate identifier").
 */
type DriveBridgeAuthResponse =
  | { type: 'xpdf-drive-auth-success'; req: string; accessToken: string; expiresIn: number | null }
  | { type: 'xpdf-drive-auth-error'; req: string; error: string }
  | { type: 'xpdf-drive-auth-cancel'; req: string; error: string };

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
  return window.open(url, 'xpdf-drive-auth', features);
}

function readEnvClientId(): string {
  const id = (import.meta as any).env?.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!trimmed) throw new Error('Missing VITE_GOOGLE_DRIVE_CLIENT_ID (required for Google Drive)');
  return trimmed;
}

function readStoredToken(): StoredToken | null {
  if (typeof localStorage === 'undefined') return null;

  const rawToken = localStorage.getItem(DRIVE_TOKEN_KEY);
  if (!rawToken) return null;

  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  // Back-compat: if we ever stored JSON, migrate it to string + separate expires key.
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as any;
      const accessToken = typeof parsed?.accessToken === 'string' ? parsed.accessToken.trim() : '';
      const expiresAt = typeof parsed?.expiresAt === 'number' ? parsed.expiresAt : undefined;
      if (!accessToken) return null;
      const obtainedAt = Date.now();
      writeStoredToken({ accessToken, expiresAt, obtainedAt, scopeVersion: SCOPE_VERSION });
      return { accessToken, expiresAt, obtainedAt, scopeVersion: SCOPE_VERSION };
    } catch {
      return null;
    }
  }

  const expiresRaw = localStorage.getItem(DRIVE_TOKEN_EXPIRES_KEY);
  const expiresAt = expiresRaw != null ? Number(expiresRaw) : undefined;
  const obtainedRaw = localStorage.getItem(DRIVE_TOKEN_OBTAINED_KEY);
  const obtainedAt = obtainedRaw != null ? Number(obtainedRaw) : undefined;
  const scopeVerRaw = localStorage.getItem(DRIVE_TOKEN_SCOPEVER_KEY);
  const scopeVersion = scopeVerRaw != null ? Number(scopeVerRaw) : undefined;

  return {
    accessToken: trimmed,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
    obtainedAt: Number.isFinite(obtainedAt) ? obtainedAt : undefined,
    scopeVersion: Number.isFinite(scopeVersion) ? scopeVersion : undefined,
  };
}

function writeStoredToken(token: StoredToken | null) {
  if (typeof localStorage === 'undefined') return;
  if (!token) {
    localStorage.removeItem(DRIVE_TOKEN_KEY);
    localStorage.removeItem(DRIVE_TOKEN_EXPIRES_KEY);
    localStorage.removeItem(DRIVE_TOKEN_OBTAINED_KEY);
    localStorage.removeItem(DRIVE_TOKEN_SCOPEVER_KEY);
    return;
  }

  localStorage.setItem(DRIVE_TOKEN_KEY, token.accessToken);

  if (typeof token.expiresAt === 'number' && Number.isFinite(token.expiresAt)) {
    localStorage.setItem(DRIVE_TOKEN_EXPIRES_KEY, String(token.expiresAt));
  } else {
    localStorage.removeItem(DRIVE_TOKEN_EXPIRES_KEY);
  }

  if (typeof token.obtainedAt === 'number' && Number.isFinite(token.obtainedAt)) {
    localStorage.setItem(DRIVE_TOKEN_OBTAINED_KEY, String(token.obtainedAt));
  } else {
    localStorage.removeItem(DRIVE_TOKEN_OBTAINED_KEY);
  }

  localStorage.setItem(DRIVE_TOKEN_SCOPEVER_KEY, String(token.scopeVersion ?? SCOPE_VERSION));
}

function isNonExpired(token: StoredToken | null): token is StoredToken {
  if (!token?.accessToken) return false;

  if ((token.scopeVersion ?? 0) !== SCOPE_VERSION) return false;

  if (typeof token.expiresAt === 'number') {
    return Date.now() + 15_000 < token.expiresAt;
  }

  if (typeof token.obtainedAt === 'number') {
    return Date.now() - token.obtainedAt < 55 * 60 * 1000;
  }

  return false;
}

export function setDriveToken(params: { accessToken: string; expiresAt?: number }): void {
  const accessToken = params.accessToken.trim();
  if (!accessToken) return;

  const next: StoredToken = {
    accessToken,
    expiresAt: typeof params.expiresAt === 'number' ? params.expiresAt : undefined,
    obtainedAt: Date.now(),
    scopeVersion: SCOPE_VERSION,
  };

  inMemoryToken = next;
  writeStoredToken(next);
}

function loadGisScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-gis-client="1"]') as HTMLScriptElement | null;
    if (existing && (window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gisClient = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

function ensureTokenClientInitialized(): void {
  if (tokenClient) return;
  const clientId = readEnvClientId();
  const g = (window as any).google;
  if (!g?.accounts?.oauth2?.initTokenClient) throw new Error('Google Identity Services is not available');

  tokenClient = g.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
  });
}

function tryEnsureTokenClientInitializedSync(): void {
  if (tokenClient) return;
  const g = (window as any).google;
  if (!g?.accounts?.oauth2?.initTokenClient) return;
  ensureTokenClientInitialized();
}

function shouldUseBridgePreferred(): boolean {
  try {
    // If you're running COOP/COEP for SharedArrayBuffer, always prefer the bridge.
    return Boolean((window as any).crossOriginIsolated) && typeof (window as any).BroadcastChannel !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Bridge flow: opens /auth/drive.html in a same-origin popup.
 *
 * IMPORTANT FIX:
 * - Do NOT treat popup.closed as authoritative (it can be flaky / throw / be "true" early under COOP/COEP).
 * - Only fail via explicit cancel/error message OR timeout.
 * - Poll localStorage to survive agent-cluster / storage-event suppression.
 */
async function requestDriveTokenViaBridge(options?: { prompt?: '' | 'consent' | 'select_account' }): Promise<string> {
  const clientId = readEnvClientId();
  const req = Math.random().toString(16).slice(2) + Date.now().toString(16);
  const prompt = options?.prompt ?? 'consent';

  const bridgeUrl = new URL('/auth/drive.html', window.location.href);
  bridgeUrl.searchParams.set('req', req);
  bridgeUrl.searchParams.set('client_id', clientId);
  bridgeUrl.searchParams.set('scope', SCOPES);
  bridgeUrl.searchParams.set('prompt', prompt);

  const bc = new BroadcastChannel('xpdf:drive:auth');
  const LS_KEY = `xpdf:drive:auth:bridge:${req}`;

  const POLL_MS = 250;

  let popup: Window | null = null;
  let timeoutId: number | null = null;
  let pollId: number | null = null;

  const parseMsg = (raw: string | null): DriveBridgeAuthResponse | null => {
    if (!raw) return null;
    try {
      const msg = JSON.parse(raw) as any;
      if (!msg || msg.req !== req || typeof msg.type !== 'string') return null;
      return msg as DriveBridgeAuthResponse;
    } catch {
      return null;
    }
  };

  if (requestInFlight) return requestInFlight;

  requestInFlight = new Promise<string>((resolve, reject) => {
    let done = false;

    const storageListener = (e: StorageEvent) => {
      if (e.key !== LS_KEY || !e.newValue) return;
      const msg = parseMsg(e.newValue);
      if (msg) handleMsg(msg);
    };

    const messageListener = (ev: MessageEvent) => {
      try {
        if (ev.origin !== window.location.origin) return;
        const msg = ev.data as DriveBridgeAuthResponse;
        if (!msg || (msg as any).req !== req) return;
        handleMsg(msg);
      } catch {
        // ignore
      }
    };

    const cleanup = () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      timeoutId = null;

      if (pollId != null) window.clearInterval(pollId);
      pollId = null;

      try {
        window.removeEventListener('storage', storageListener as any);
      } catch {}
      try {
        window.removeEventListener('message', messageListener as any);
      } catch {}

      try {
        localStorage.removeItem(LS_KEY);
      } catch {}

      try {
        bc.close();
      } catch {}

      try {
        popup?.close();
      } catch {}
      popup = null;
    };

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      fn();
    };

    const fail = (err: any) => {
      finish(() => {
        cleanup();
        reject(err);
      });
    };

    const succeed = (accessToken: string, expiresAt: number | undefined) => {
      finish(() => {
        setDriveToken({ accessToken, expiresAt });
        cleanup();
        resolve(accessToken);
      });
    };

    const handleMsg = (msg: DriveBridgeAuthResponse) => {
      if (!msg || (msg as any).req !== req) return;

      if (msg.type === 'xpdf-drive-auth-success') {
        const accessToken = String((msg as any).accessToken || '').trim();
        if (!accessToken) {
          fail(new Error('Google Drive sign-in returned no access token'));
          return;
        }
        const expiresIn = Number((msg as any).expiresIn);
        const expiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;
        succeed(accessToken, expiresAt);
        return;
      }

      if (msg.type === 'xpdf-drive-auth-cancel') {
        const err: any = new Error('Sign-in popup was closed or blocked.');
        err.code = 'popup_closed_by_user';
        fail(err);
        return;
      }

      if (msg.type === 'xpdf-drive-auth-error') {
        const err: any = new Error(String((msg as any).error || 'Google sign-in failed'));
        err.code = 'drive/auth_failed';
        fail(err);
      }
    };

    timeoutId = window.setTimeout(() => {
      const err: any = new Error('Google sign-in timed out. Check popup blockers and try again.');
      err.code = 'drive/auth_timeout';
      fail(err);
    }, AUTH_TIMEOUT_MS);

    window.addEventListener('storage', storageListener as any);
    window.addEventListener('message', messageListener);

    bc.onmessage = (ev) => {
      const msg = ev.data as DriveBridgeAuthResponse;
      if (!msg || (msg as any).req !== req) return;
      handleMsg(msg);
    };

    // must be sync
    popup = openCenteredPopup(bridgeUrl.toString());
    if (!popup) {
      const err: any = new Error('Popup was blocked. Please allow popups for this site and try again.');
      err.code = 'popup_blocked';
      fail(err);
      return;
    }

    // Poll localStorage (survives storage-event suppression / COOP group boundaries)
    pollId = window.setInterval(() => {
      try {
        const msg = parseMsg(localStorage.getItem(LS_KEY));
        if (msg) handleMsg(msg);
      } catch {
        // ignore
      }

      // NOTE: we intentionally do NOT fail on popup.closed here.
      // Many browsers/COOP/COEP can misreport closed or throw; rely on explicit cancel/error or timeout.
    }, POLL_MS);
  });

  requestInFlight.finally(() => {
    requestInFlight = null;
  });

  return requestInFlight;
}

export async function initDriveAuth(): Promise<void> {
  readEnvClientId();
  await loadGisScript();
  ensureTokenClientInitialized();

  inMemoryToken = readStoredToken();
  dlog('initDriveAuth', { restoredToken: Boolean(inMemoryToken?.accessToken) });
}

export function requestDriveTokenInteractive(options?: {
  prompt?: '' | 'consent' | 'select_account';
  force?: boolean;
  forceBridge?: boolean;
}): Promise<string> {
  if (!options?.force && isNonExpired(inMemoryToken)) {
    return Promise.resolve(inMemoryToken.accessToken);
  }

  // If a request is already running, reuse it (prevents multi-click races).
  if (requestInFlight) return requestInFlight;

  const wantBridge = Boolean(options?.forceBridge) || shouldUseBridgePreferred();

  // Prefer bridge in COOP/COEP / crossOriginIsolated and also when explicitly forced.
  if (wantBridge && typeof (window as any).BroadcastChannel !== 'undefined') {
    dlog('requestDriveTokenInteractive: using bridge', { prompt: options?.prompt });
    return requestDriveTokenViaBridge({ prompt: options?.prompt });
  }

  // Native GIS path (same-window)
  tryEnsureTokenClientInitializedSync();

  // If GIS isn't ready in this window, fall back to bridge instead of failing fast.
  if (!tokenClient && typeof (window as any).BroadcastChannel !== 'undefined') {
    dlog('requestDriveTokenInteractive: tokenClient not ready; falling back to bridge', { prompt: options?.prompt });
    return requestDriveTokenViaBridge({ prompt: options?.prompt });
  }

  if (!tokenClient) {
    const err: any = new Error('Google Drive auth is still initializing. Please try again.');
    err.code = 'drive/auth_not_ready';
    return Promise.reject(err);
  }

  requestInFlight = new Promise<string>((resolve, reject) => {
    let done = false;

    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      const err: any = new Error('Google sign-in timed out. Check popup blockers and try again.');
      err.code = 'drive/auth_timeout';
      reject(err);
    }, AUTH_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeoutId);
      fn();
    };

    tokenClient.callback = (resp: any) => {
      if (resp?.error) {
        const errMsg = String(resp.error);
        const err: any = new Error(errMsg);
        err.code = errMsg;
        finish(() => reject(err));
        return;
      }

      const accessToken = String(resp?.access_token || '').trim();
      if (!accessToken) {
        finish(() => reject(new Error('Google Drive sign-in returned no access token')));
        return;
      }

      const expiresIn = Number(resp?.expires_in);
      const expiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;

      setDriveToken({ accessToken, expiresAt });
      finish(() => resolve(accessToken));
    };

    try {
      tokenClient.requestAccessToken({ prompt: options?.prompt ?? '' });
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error('Google sign-in failed')));
    }
  });

  requestInFlight.finally(() => {
    requestInFlight = null;
  });

  return requestInFlight;
}

export async function ensureDriveToken(interactive = true): Promise<string> {
  if (isNonExpired(inMemoryToken)) return inMemoryToken.accessToken;

  if (!interactive) throw new Error('No valid cached Google Drive token');

  return await requestDriveTokenInteractive();
}

export function clearDriveToken(): void {
  inMemoryToken = null;
  writeStoredToken(null);
}

export async function revokeDriveAccess(): Promise<void> {
  const prev = inMemoryToken ?? readStoredToken();
  const accessToken = prev?.accessToken;

  clearDriveToken();

  try {
    await loadGisScript();
    const g = (window as any).google;
    if (accessToken && g?.accounts?.oauth2?.revoke) {
      await new Promise<void>((resolve) => {
        g.accounts.oauth2.revoke(accessToken, () => resolve());
      });
    }
  } catch {
    // ignore
  }
}
