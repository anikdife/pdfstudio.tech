export type GoogleAuthState = {
  isSignedIn: boolean;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
  accessToken?: string;
};

type StoredAuthState = GoogleAuthState & {
  expiresAt?: number; // epoch ms
};

const AUTH_STORAGE_KEY = 'xpdf.googleAuth.v1';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let gisLoadPromise: Promise<void> | null = null;
let tokenClient: any | null = null;
let inMemoryState: StoredAuthState | null = null;

function readEnvClientId(): string | null {
  const id = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return id && id.trim().length > 0 ? id.trim() : null;
}

function readStoredState(): StoredAuthState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.isSignedIn !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredAuthState | null) {
  if (typeof localStorage === 'undefined') return;
  if (!state) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
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

async function fetchUserInfo(accessToken: string): Promise<Pick<GoogleAuthState, 'userName' | 'userEmail' | 'avatarUrl'>> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as any;
    return {
      userName: typeof data?.name === 'string' ? data.name : undefined,
      userEmail: typeof data?.email === 'string' ? data.email : undefined,
      avatarUrl: typeof data?.picture === 'string' ? data.picture : undefined,
    };
  } catch {
    return {};
  }
}

function ensureTokenClientInitialized(): void {
  if (tokenClient) return;
  const clientId = readEnvClientId();
  if (!clientId) return;
  const g = (window as any).google;
  if (!g?.accounts?.oauth2?.initTokenClient) return;

  // Callback is provided per-request to make each call awaitable.
  tokenClient = g.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
  });
}

export function getStoredGoogleAuthState(): GoogleAuthState | null {
  const s = inMemoryState ?? readStoredState();
  if (!s?.isSignedIn) return null;

  // Best-effort expiry check: if we know it's expired, treat as signed out.
  if (typeof s.expiresAt === 'number' && Date.now() > s.expiresAt) {
    return null;
  }

  return {
    isSignedIn: true,
    userName: s.userName,
    userEmail: s.userEmail,
    avatarUrl: s.avatarUrl,
    accessToken: s.accessToken,
  };
}

export async function initGoogleAuth(): Promise<void> {
  const clientId = readEnvClientId();
  if (!clientId) {
    // Feature disabled when env vars are missing.
    inMemoryState = null;
    return;
  }

  await loadGisScript();
  ensureTokenClientInitialized();

  // Restore minimal stored state (token may or may not still be valid).
  inMemoryState = readStoredState();
}

export async function signInWithGoogle(): Promise<GoogleAuthState> {
  const clientId = readEnvClientId();
  if (!clientId) {
    return { isSignedIn: false };
  }

  await loadGisScript();
  ensureTokenClientInitialized();
  if (!tokenClient) {
    return { isSignedIn: false };
  }

  const tokenResponse = await new Promise<any>((resolve, reject) => {
    tokenClient.callback = (resp: any) => {
      if (resp?.error) reject(new Error(resp.error));
      else resolve(resp);
    };

    // prompt: 'consent' makes first-time flow reliable; returning users may still get a silent token.
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  const accessToken = String(tokenResponse?.access_token || '');
  if (!accessToken) {
    const next = { isSignedIn: false } as StoredAuthState;
    inMemoryState = next;
    writeStoredState(null);
    return { isSignedIn: false };
  }

  const expiresIn = Number(tokenResponse?.expires_in);
  const expiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;

  const user = await fetchUserInfo(accessToken);

  const next: StoredAuthState = {
    isSignedIn: true,
    accessToken,
    expiresAt,
    userName: user.userName,
    userEmail: user.userEmail,
    avatarUrl: user.avatarUrl,
  };

  inMemoryState = next;
  writeStoredState(next);

  return {
    isSignedIn: true,
    accessToken,
    userName: next.userName,
    userEmail: next.userEmail,
    avatarUrl: next.avatarUrl,
  };
}

export async function signOutFromGoogle(): Promise<void> {
  const prev = inMemoryState ?? readStoredState();
  const accessToken = prev?.accessToken;

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

  inMemoryState = null;
  writeStoredState(null);
}

export function getAccessTokenOrNull(): string | null {
  const s = inMemoryState ?? readStoredState();
  if (!s?.isSignedIn) return null;
  if (!s.accessToken) return null;
  if (typeof s.expiresAt === 'number' && Date.now() > s.expiresAt) return null;
  return s.accessToken;
}
