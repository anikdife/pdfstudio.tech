import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';

export type FeedbackCategory = 'bug' | 'feature' | 'ui-confusion' | 'performance' | 'other';

export interface FeedbackPayload {
  category: FeedbackCategory;
  rating: number | null; // 1–5 (or null)
  tryingToDo: string; // "What were you trying to do?"
  description: string; // Main feedback text
  stepsToReproduce?: string; // Only for bugs (optional)
  email?: string; // Optional contact
  screenshotUrl?: string; // Optional, leave as null/empty for now
  browserInfo?: string; // userAgent + platform
  createdAt: Date;
}

export type FeedbackRecord = {
  id: string;
  category: FeedbackCategory;
  rating: number | null;
  tryingToDo: string;
  description: string;
  stepsToReproduce: string | null;
  email: string | null;
  screenshotUrl: string | null;
  browserInfo: string | null;
  createdAt: Date | null;
};

function buildBrowserInfo(): string {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const platform = typeof navigator !== 'undefined' ? (navigator as any).platform ?? 'unknown' : 'unknown';
    return `ua=${ua}; platform=${platform}`;
  } catch {
    return 'ua=unknown; platform=unknown';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      },
    );
  });
}

export async function submitFeedback(payload: Omit<FeedbackPayload, 'createdAt'>): Promise<void> {
  try {
    if (!db) throw new Error('Firebase is not configured (Firestore unavailable).');

    const browserInfo = payload.browserInfo?.trim() ? payload.browserInfo.trim() : buildBrowserInfo();

    const docToWrite = {
      category: payload.category,
      rating: payload.rating ?? null,
      tryingToDo: payload.tryingToDo,
      description: payload.description,
      stepsToReproduce: payload.stepsToReproduce?.trim() ? payload.stepsToReproduce.trim() : null,
      email: payload.email?.trim() ? payload.email.trim() : null,
      screenshotUrl: payload.screenshotUrl?.trim() ? payload.screenshotUrl.trim() : null,
      browserInfo,
      createdAt: (() => {
        try {
          return serverTimestamp();
        } catch {
          return new Date();
        }
      })(),
    };

    await withTimeout(addDoc(collection(db, 'feedback'), docToWrite as any), 12000, 'Feedback submit');
  } catch (err) {
    throw err;
  }
}

export async function fetchAllFeedback(): Promise<FeedbackRecord[]> {
  if (!db) throw new Error('Firebase is not configured (Firestore unavailable).');

  const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
  const snap = await withTimeout(getDocs(q), 12000, 'Fetch feedback');
  const out: FeedbackRecord[] = [];

  snap.forEach((d) => {
    const data: any = d.data();
    const createdAtRaw = data?.createdAt;
    const createdAt =
      createdAtRaw && typeof createdAtRaw?.toDate === 'function'
        ? createdAtRaw.toDate()
        : createdAtRaw instanceof Date
          ? createdAtRaw
          : null;

    out.push({
      id: d.id,
      category: (data?.category as FeedbackCategory) ?? 'other',
      rating: typeof data?.rating === 'number' ? data.rating : null,
      tryingToDo: typeof data?.tryingToDo === 'string' ? data.tryingToDo : '',
      description: typeof data?.description === 'string' ? data.description : '',
      stepsToReproduce: typeof data?.stepsToReproduce === 'string' ? data.stepsToReproduce : null,
      email: typeof data?.email === 'string' ? data.email : null,
      screenshotUrl: typeof data?.screenshotUrl === 'string' ? data.screenshotUrl : null,
      browserInfo: typeof data?.browserInfo === 'string' ? data.browserInfo : null,
      createdAt,
    });
  });

  return out;
}
