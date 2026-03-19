import { create } from 'zustand';
import {
  ensureDriveToken,
  getDriveAuthDiagnostics,
  initDriveAuth,
  requestDriveTokenInteractive,
  revokeDriveAccess,
  setDriveToken,
} from '../services/googleDriveAuth';
import type { DriveFileSummary } from '../services/googleDriveClient';
import { listFiles } from '../services/googleDriveClient';
import { auth as firebaseAuth, firebaseEnabled } from '../services/firebaseClient';
import { useFirebaseUserStore } from './firebaseUserStore';

export async function connectDriveForFirebaseUser(): Promise<void> {
  const user = firebaseAuth?.currentUser;

  if (!user) {
    const err: any = new Error('Firebase login required before Drive connect.');
    err.code = 'drive_requires_firebase';
    throw err;
  }

  const accessToken = await requestDriveTokenInteractive({
    prompt: 'consent',
  });

  // Persist token for Drive client usage
  setDriveToken({ accessToken });

  const driveUser = await fetchUserInfo(accessToken);

  // Enforce account match (if Firebase has an email and Drive returns an email)
  const fbEmail = (user.email ?? '').trim().toLowerCase();
  const driveEmail = (driveUser.userEmail ?? '').trim().toLowerCase();

  if (fbEmail && driveEmail && fbEmail !== driveEmail) {
    // Revoke Drive token so we don't have a Drive session attached to the wrong Firebase user.
    try {
      await revokeDriveAccess();
    } catch {
      // ignore
    }
    const err: any = new Error(
      'Google Drive account does not match your app account. Please sign in to Drive using the same Google email as Firebase.'
    );
    err.code = 'drive/email_mismatch';
    throw err;
  }

  const files = await listFiles({ uid: user.uid, interactive: true });

  useGoogleStore.setState({
    auth: { isSignedIn: true, ...driveUser },
    driveFiles: files,
    lastDriveError: null,
  });
}

function isUserClosedAuthPopup(err: unknown): boolean {
  const anyErr = err as any;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
  const message = typeof anyErr?.message === 'string' ? anyErr.message : '';

  // Firebase Auth error codes
  if (code === 'auth/popup-closed-by-user') return true;
  if (code === 'auth/cancelled-popup-request') return true;

  // Best-effort fallbacks
  const haystack = `${code} ${message}`.toLowerCase();
  if (haystack.includes('popup-closed-by-user')) return true;
  if (haystack.includes('cancelled-popup-request')) return true;
  if (haystack.includes('popup closed by user')) return true;

  // Google Identity Services errors
  if (haystack.includes('popup_closed_by_user')) return true;
  if (haystack.includes('popup_blocked')) return true;

  // Our Drive auth layer can fail fast when GIS isn't ready yet.
  if (code === 'drive/auth_not_ready') return true;
  if (haystack.includes('auth_not_ready')) return true;

  // If GIS never returns a callback (popup blocked/browser policy), treat as recoverable.
  if (code === 'drive/auth_timeout') return true;
  if (haystack.includes('auth_timeout')) return true;

  // Bridge flow may throw a dedicated popup blocked code.
  if (code === 'popup_blocked') return true;

  return false;
}

export type GoogleAuthState = {
  isSignedIn: boolean;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
};

function shouldBlockCrossOriginImages(): boolean {
  try {
    return Boolean((window as any).crossOriginIsolated);
  } catch {
    return false;
  }
}

function sanitizeAvatarUrl(url: unknown): string | undefined {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return undefined;
  if (!shouldBlockCrossOriginImages()) return raw;

  try {
    const u = new URL(raw, window.location.href);
    if (u.origin === window.location.origin) return u.toString();
  } catch {
    // ignore
  }
  return undefined;
}

async function fetchUserInfo(
  accessToken: string
): Promise<Pick<GoogleAuthState, 'userName' | 'userEmail' | 'avatarUrl'>> {
  try {
    const endpoints = [
      'https://openidconnect.googleapis.com/v1/userinfo',
      'https://www.googleapis.com/oauth2/v3/userinfo',
    ];

    for (const url of endpoints) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const userEmail = typeof data?.email === 'string' ? data.email : undefined;
      const userName = typeof data?.name === 'string' ? data.name : undefined;
      const avatarUrl = sanitizeAvatarUrl(data?.picture);
      if (userEmail || userName || avatarUrl) return { userName, userEmail, avatarUrl };
    }
    return {};
  } catch {
    return {};
  }
}

type GoogleStoreState = {
  auth: GoogleAuthState | null;
  isAuthLoading: boolean;
  driveFiles: DriveFileSummary[];
  isDashboardOpen: boolean;
  lastDriveError: string | null;

  initAuth: () => Promise<void>;
  signIn: () => Promise<boolean>;
  connectDriveInteractive: () => Promise<boolean>;
  beginDriveConnectFromClick: () => void;
  signOut: () => Promise<void>;

  openDashboard: () => void;
  closeDashboard: () => void;

  refreshDriveFiles: (interactive?: boolean) => Promise<void>;
  setDriveFiles: (files: DriveFileSummary[]) => void;
};

function getFirebaseUidOrNull(): string | null {
  if (!firebaseEnabled || !firebaseAuth) return null;
  const uid = firebaseAuth.currentUser?.uid;
  return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
}

function getFirebaseEmailOrNull(): string | null {
  if (!firebaseEnabled || !firebaseAuth) return null;
  const email = firebaseAuth.currentUser?.email;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

function toDriveUiMessage(err: unknown): string {
  const anyErr = err as any;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';

  if (code === 'drive/no_firebase_user') return 'Please sign in to the app to use Drive sync.';
  if (code === 'drive/no_firestore') return 'Firebase/Firestore is not configured.';
  if (code === 'drive/unauthorized') return 'Google Drive session expired. Click “Sign in with Google” to reconnect.';
  if (code === 'drive/insufficient_scopes') return 'Google Drive permission is missing. Click “Sign in with Google” and allow Drive access.';
  if (code === 'drive/folder_not_initialized') return 'Connect Google Drive to initialize your folder.';
  if (code === 'drive/folder_invalid') return 'Your Drive folder is missing or inaccessible. Sign in again to recreate it.';
  if (code === 'drive/email_mismatch')
    return 'Google Drive account does not match your app account. Please sign in to Drive using the same Google email as Firebase.';
  if (code === 'drive_requires_firebase')
    return 'Please sign in to the app (Firebase) first, then connect Google Drive.';

  return err instanceof Error ? err.message : 'Drive request failed';
}

function isDriveUnauthorized(err: unknown): boolean {
  const anyErr = err as any;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
  return code === 'drive/unauthorized' || code === 'drive/insufficient_scopes';
}

export const useGoogleStore = create<GoogleStoreState>((set, get) => ({
  auth: null,
  isAuthLoading: false,
  driveFiles: [],
  isDashboardOpen: false,
  lastDriveError: null,

  initAuth: async () => {
    set({ isAuthLoading: true });
    try {
      try {
        await initDriveAuth();
      } catch {
        if (!get().auth?.isSignedIn) set({ auth: null, driveFiles: [] });
        return;
      }

      let accessToken: string | null = null;
      try {
        accessToken = await ensureDriveToken(false);
      } catch {
        accessToken = null;
      }

      if (!accessToken) {
        if (get().auth?.isSignedIn) return;

        const diag = getDriveAuthDiagnostics();
        if (diag.isNonExpiredToken) {
          try {
            accessToken = await ensureDriveToken(false);
          } catch {
            accessToken = null;
          }
        }
      }

      if (accessToken) {
        // Policy: Drive sync requires a Firebase user. If Firebase is signed out,
        // do not show Drive as connected. Keep token, but don't show connected state.
        if (firebaseEnabled && !getFirebaseUidOrNull()) {
          if (!get().auth?.isSignedIn) set({ auth: null, driveFiles: [], lastDriveError: null });
          return;
        }

        const user = await fetchUserInfo(accessToken);

        // Enforce email match also on init
        const fbEmail = (getFirebaseEmailOrNull() ?? '').trim().toLowerCase();
        const driveEmail = (user.userEmail ?? '').trim().toLowerCase();
        if (fbEmail && driveEmail && fbEmail !== driveEmail) {
          try {
            await revokeDriveAccess();
          } catch {
            // ignore
          }
          set({ auth: null, driveFiles: [], lastDriveError: toDriveUiMessage({ code: 'drive/email_mismatch' } as any) });
          return;
        }

        set({ auth: { isSignedIn: true, ...user }, lastDriveError: null });
        void get().refreshDriveFiles(false);
      } else {
        if (!get().auth?.isSignedIn) set({ auth: null, driveFiles: [], lastDriveError: null });
      }
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signIn: async () => await get().connectDriveInteractive(),

  beginDriveConnectFromClick: () => {
    try {
      set({ isAuthLoading: true, lastDriveError: 'Opening Google sign-in…' });
      void get().connectDriveInteractive().finally(() => set({ isAuthLoading: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      set({ lastDriveError: msg, isAuthLoading: false });
    }
  },

  connectDriveInteractive: async () => {
    set({ isAuthLoading: true });
    try {
      // Ensure Firebase store has hydrated (idempotent)
      if (firebaseEnabled) {
        try {
          await useFirebaseUserStore.getState().initFirebaseAuth();
        } catch {
          // ignore
        }
      }

      const fbState = useFirebaseUserStore.getState();

      // Gate on readiness first (prevents false "sign in first" on cold load)
      if (firebaseEnabled && !fbState.isAuthReady) {
        set({ lastDriveError: 'Loading your account… please try again in a moment.' });
        return false;
      }

      // Enforce Firebase-first policy
      const uid = getFirebaseUidOrNull();
      if (!uid) {
        set({ lastDriveError: 'Please sign into the app before connecting Google Drive.' });
        return false;
      }

      set({ lastDriveError: 'Opening Google sign-in…' });
      void initDriveAuth().catch(() => {});

      set({ lastDriveError: 'Loading Drive files…' });
      try {
        await connectDriveForFirebaseUser();
        return true;
      } catch (err) {
        const anyErr = err as any;

        if (anyErr?.code === 'drive_requires_firebase') {
          set({ lastDriveError: 'Please sign into the app before connecting Google Drive.' });
          return false;
        }

        if (anyErr?.code === 'drive/email_mismatch') {
          set({ auth: null, driveFiles: [], lastDriveError: toDriveUiMessage(err) });
          return false;
        }

        if (isUserClosedAuthPopup(err)) {
          const code = (err as any)?.code;
          const msg =
            code === 'drive/auth_not_ready'
              ? 'Google Drive is still initializing. Please try again.'
              : code === 'drive/auth_timeout'
                ? 'Google sign-in timed out. Check popup blockers and try again.'
                : code === 'popup_blocked'
                  ? 'Popup was blocked. Please allow popups for this site and try again.'
                  : 'Sign-in popup was closed or blocked.';
          set({ lastDriveError: msg });
          return false;
        }

        const msg = toDriveUiMessage(err);
        if (isDriveUnauthorized(err)) set({ auth: null, driveFiles: [], lastDriveError: msg });
        else set({ driveFiles: [], lastDriveError: msg });

        // Preserve prior behavior: return true for non-popup failures
        return true;
      }
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signOut: async () => {
    set({ isAuthLoading: true });
    try {
      await revokeDriveAccess();
      set({ auth: null, driveFiles: [], isDashboardOpen: false, lastDriveError: null });
    } finally {
      set({ isAuthLoading: false });
    }
  },

  openDashboard: () => {
    set({ isDashboardOpen: true });
    void get().refreshDriveFiles(false);
  },
  closeDashboard: () => set({ isDashboardOpen: false }),

  refreshDriveFiles: async (interactive = false) => {
    if (interactive) {
      await get().connectDriveInteractive();
      return;
    }

    const authState = get().auth;
    if (!authState?.isSignedIn) {
      set({ driveFiles: [], lastDriveError: null });
      return;
    }

    const uid = getFirebaseUidOrNull();
    if (!uid) {
      const show = Boolean(get().isDashboardOpen);
      set({
        auth: null,
        driveFiles: [],
        lastDriveError: show ? 'Please sign in to the app to use Drive sync.' : null,
      });
      return;
    }

    try {
      await ensureDriveToken(false);
      const files = await listFiles({
        pageSize: 30,
        interactive: false,
        uid,
        driveUserEmail: authState.userEmail,
      });
      set({ driveFiles: files, lastDriveError: null });
    } catch (err) {
      const msg = toDriveUiMessage(err);
      if (isDriveUnauthorized(err)) {
        set({ auth: null, driveFiles: [], lastDriveError: msg });
      } else {
        const show = Boolean(get().isDashboardOpen);
        set({ driveFiles: [], lastDriveError: show ? msg : null });
      }
    }
  },

  setDriveFiles: (files) => set({ driveFiles: files }),
}));
