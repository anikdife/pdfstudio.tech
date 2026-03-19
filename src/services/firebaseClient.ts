import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

function readEnvString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const firebaseConfig = {
  apiKey: readEnvString((import.meta as any).env?.VITE_FIREBASE_API_KEY),
  authDomain: readEnvString((import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: readEnvString((import.meta as any).env?.VITE_FIREBASE_PROJECT_ID),
  storageBucket: readEnvString((import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: readEnvString((import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: readEnvString((import.meta as any).env?.VITE_FIREBASE_APP_ID),
} as const;

export const firebaseEnabled =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.storageBucket &&
  !!firebaseConfig.messagingSenderId &&
  !!firebaseConfig.appId;

export const firebaseApp: FirebaseApp | null = (() => {
  if (!firebaseEnabled) return null;
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
})();

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
