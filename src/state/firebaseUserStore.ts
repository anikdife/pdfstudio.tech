import { create } from 'zustand';
import { completeFirebaseRedirectSignIn, onAuthStateChangedListener, signInWithGoogleFirebase, signOutFromFirebase } from '../services/firebaseAuth';
import { upsertUserMeta } from '../services/firebaseActivity';

export type FirebaseUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

type FirebaseUserStoreState = {
  firebaseUser: FirebaseUser | null;
  isAuthReady: boolean;
  isAuthLoading: boolean;
  lastAuthError: string | null;

  initFirebaseAuth: () => Promise<void>;
  signInFirebase: () => Promise<void>;
  signInFirebaseForEmail: (email: string) => Promise<void>;
  signOutFirebase: () => Promise<void>;
};

let unsubscribeAuth: (() => void) | null = null;

export const useFirebaseUserStore = create<FirebaseUserStoreState>((set) => ({
  firebaseUser: null,
  isAuthReady: false,
  isAuthLoading: false,
  lastAuthError: null,

  initFirebaseAuth: async () => {
  if (unsubscribeAuth) return;

  try {
    const completed = await completeFirebaseRedirectSignIn();
    if (completed?.error) {
      console.error(completed.error);
      set({ lastAuthError: completed.error.message || 'Sign-in failed' });
    }
  } catch {
    // ignore
  }

  // ✅ make sure "ready" eventually becomes true even if listener init is slow
  set({ isAuthReady: false });

  unsubscribeAuth = onAuthStateChangedListener((identity) => {
    if (identity.isLoggedIn && identity.uid) {
      void upsertUserMeta({
        displayName: identity.displayName,
        email: identity.email,
        photoURL: identity.photoURL,
      });
    }
    set({
      firebaseUser:
        identity.isLoggedIn && identity.uid
          ? {
              uid: identity.uid,
              displayName: identity.displayName,
              email: identity.email,
              photoURL: identity.photoURL,
            }
          : null,
      isAuthReady: true,
      lastAuthError: identity.isLoggedIn ? null : useFirebaseUserStore.getState().lastAuthError,
    });
  });
},
  signInFirebase: async () => {
    set({ isAuthLoading: true });
    try {
      set({ lastAuthError: null });
      await signInWithGoogleFirebase();
      // State will hydrate via onAuthStateChanged.
    } catch (e) {
      const anyErr = e as any;
      const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      const haystack = `${code} ${msg}`.toLowerCase();

      const isPopupBlocked = code === 'popup_blocked' || haystack.includes('popup was blocked') || haystack.includes('popup_blocked');
      const isPopupClosed = code === 'popup_closed_by_user' || haystack.includes('popup_closed_by_user') || haystack.includes('popup closed');
      const isTimeout = code === 'google/auth_timeout' || haystack.includes('auth_timeout') || haystack.includes('timed out');

      const uiMsg = isPopupBlocked
        ? 'Popup was blocked. Please allow popups for this site and try again.'
        : isPopupClosed
          ? 'Sign-in popup was closed. Please try again.'
          : isTimeout
            ? 'Google sign-in timed out. Check popup blockers and try again.'
            : msg;

      set({ lastAuthError: uiMsg });
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signInFirebaseForEmail: async (email: string) => {
    set({ isAuthLoading: true });
    try {
      set({ lastAuthError: null });
      const hint = (email || '').trim();
      await signInWithGoogleFirebase(hint ? { loginHint: hint, prompt: 'select_account' } : undefined);
      // State will hydrate via onAuthStateChanged.
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      set({ lastAuthError: msg });
    } finally {
      set({ isAuthLoading: false });
    }
  },

  signOutFirebase: async () => {
    set({ isAuthLoading: true });
    try {
      // Policy: signing out of the app also signs out of Drive.
      // Use a dynamic import to avoid a hard module cycle between stores.
      try {
        const mod = await import('./googleStore');
        await mod.useGoogleStore.getState().signOut();
      } catch {
        // ignore
      }
      await signOutFromFirebase();
      set({ firebaseUser: null });
    } finally {
      set({ isAuthLoading: false });
    }
  },
}));
