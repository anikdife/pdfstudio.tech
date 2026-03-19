import {
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db, firebaseEnabled } from './firebaseClient';

export type ActivitySource = 'local' | 'googleDrive';
export type ActivityType = 'open' | 'save' | 'export';

export type ActivityMachine =
  | 'googleDrive'
  | 'local'
  | 'win32'
  | 'mac'
  | 'linux'
  | 'android'
  | 'ios'
  | 'unknown';

export type ActivityEvent = {
  type: ActivityType;
  ts: Timestamp;
  filename: string;
  machine?: ActivityMachine; // for open
  savedTo?: ActivityMachine; // for save/export
  edited?: boolean;
};

export type UserMeta = {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  lastLoggedInAt?: Timestamp;
  lastPublicIp?: string | null;
};

let currentEditedFlag = false;

export function setCurrentEditedFlag(edited: boolean) {
  currentEditedFlag = Boolean(edited);
}

export function getCurrentEditedFlag(): boolean {
  return currentEditedFlag;
}

function getUid(): string | null {
  if (!firebaseEnabled || !auth) return null;
  const uid = auth.currentUser?.uid;
  return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
}

function requireDb() {
  if (!firebaseEnabled || !db) return null;
  return db;
}

function dayIdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

async function fetchPublicIpBestEffort(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const ip = typeof data?.ip === 'string' ? data.ip.trim() : '';
    return ip || null;
  } catch {
    return null;
  }
}

export async function upsertUserMeta(meta: Pick<UserMeta, 'displayName' | 'email' | 'photoURL'>): Promise<void> {
  const uid = getUid();
  const theDb = requireDb();
  if (!uid || !theDb) return;

  const ip = await fetchPublicIpBestEffort();

  await setDoc(
    doc(theDb, 'users', uid),
    {
      displayName: meta.displayName ?? null,
      email: meta.email ?? null,
      photoURL: meta.photoURL ?? null,
      lastLoggedInAt: serverTimestamp(),
      lastPublicIp: ip,
    },
    { merge: true },
  );
}

export async function fetchUserMeta(): Promise<UserMeta | null> {
  const uid = getUid();
  const theDb = requireDb();
  if (!uid || !theDb) return null;
  const snap = await getDoc(doc(theDb, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    displayName: typeof data?.displayName === 'string' ? data.displayName : null,
    email: typeof data?.email === 'string' ? data.email : null,
    photoURL: typeof data?.photoURL === 'string' ? data.photoURL : null,
    lastLoggedInAt: data?.lastLoggedInAt instanceof Timestamp ? data.lastLoggedInAt : undefined,
    lastPublicIp: typeof data?.lastPublicIp === 'string' ? data.lastPublicIp : null,
  };
}

export async function fetchUserSection(sectionId: string): Promise<Record<string, any> | null> {
  const uid = getUid();
  const theDb = requireDb();
  if (!uid || !theDb) return null;
  const id = (sectionId || '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(theDb, 'users', uid, 'sections', id));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  // Strip Firestore internals; return plain object.
  if (!data || typeof data !== 'object') return null;
  return data;
}

async function ensureMax7Days(uid: string): Promise<void> {
  const theDb = requireDb();
  if (!theDb) return;

  const daysCol = collection(theDb, 'users', uid, 'days');
  const q = query(daysCol, orderBy('day', 'desc'), limit(20));
  const snaps = await getDocs(q);
  const docs = snaps.docs;
  if (docs.length <= 7) return;

  for (const d of docs.slice(7)) {
    try {
      await deleteDoc(d.ref);
    } catch {
      // ignore best-effort cleanup
    }
  }
}

async function appendEvent(event: Omit<ActivityEvent, 'ts'> & { ts?: Timestamp }): Promise<void> {
  const uid = getUid();
  const theDb = requireDb();
  if (!uid || !theDb) return;

  const now = new Date();
  const dayId = dayIdFromDate(now);
  const dayStart = startOfLocalDay(now);

  const daysCol = collection(theDb, 'users', uid, 'days');
  const dayRef = doc(daysCol, dayId);

  const ev: ActivityEvent = {
    ...event,
    ts: event.ts ?? Timestamp.now(),
  };

  await setDoc(
    dayRef,
    {
      day: Timestamp.fromDate(dayStart),
      events: arrayUnion(ev as unknown as DocumentData),
    },
    { merge: true },
  );

  // Enforce retention: only keep 7 day docs.
  void ensureMax7Days(uid);
}

function detectLocalMachine(): ActivityMachine {
  if (typeof navigator === 'undefined') return 'unknown';

  const platformRaw =
    // Chromium UA-CH
    (navigator as any)?.userAgentData?.platform ||
    // Legacy
    navigator.platform ||
    '';
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';

  const p = String(platformRaw).toLowerCase();
  const u = ua.toLowerCase();

  if (p.includes('win') || u.includes('windows')) return 'win32';
  if (p.includes('mac') || u.includes('mac os') || u.includes('macintosh')) return 'mac';
  if (p.includes('linux') || u.includes('linux')) return 'linux';
  if (p.includes('android') || u.includes('android')) return 'android';
  if (p.includes('iphone') || p.includes('ipad') || p.includes('ipod') || u.includes('iphone') || u.includes('ipad')) return 'ios';

  return 'unknown';
}

function resolveMachine(source: ActivitySource): ActivityMachine {
  if (source === 'googleDrive') return 'googleDrive';
  return detectLocalMachine();
}

export async function logFileOpened(filename: string, machine: ActivitySource): Promise<void> {
  const name = (filename || '').trim();
  if (!name) return;
  await appendEvent({ type: 'open', filename: name, machine: resolveMachine(machine) });
}

export async function logFileExported(filename: string, savedTo: ActivitySource): Promise<void> {
  const name = (filename || '').trim();
  if (!name) return;
  await appendEvent({ type: 'export', filename: name, savedTo: resolveMachine(savedTo), edited: getCurrentEditedFlag() });
}

export async function logFileSaved(filename: string, savedTo: ActivitySource): Promise<void> {
  const name = (filename || '').trim();
  if (!name) return;
  await appendEvent({ type: 'save', filename: name, savedTo: resolveMachine(savedTo), edited: getCurrentEditedFlag() });
}

export type ActivityDay = {
  id: string;
  day: Timestamp;
  events: ActivityEvent[];
};

function coerceEvent(raw: any): ActivityEvent | null {
  const type = raw?.type;
  if (type !== 'open' && type !== 'save' && type !== 'export') return null;
  const ts = raw?.ts instanceof Timestamp ? raw.ts : null;
  const filename = typeof raw?.filename === 'string' ? raw.filename : '';
  if (!ts || !filename.trim()) return null;

  const isMachine = (v: any): v is ActivityMachine =>
    v === 'googleDrive' ||
    v === 'local' ||
    v === 'win32' ||
    v === 'mac' ||
    v === 'linux' ||
    v === 'android' ||
    v === 'ios' ||
    v === 'unknown';

  const machine = isMachine(raw?.machine) ? raw.machine : undefined;
  const savedTo = isMachine(raw?.savedTo) ? raw.savedTo : undefined;
  const edited = typeof raw?.edited === 'boolean' ? raw.edited : undefined;

  return {
    type,
    ts,
    filename,
    machine,
    savedTo,
    edited,
  };
}

export async function fetchRecentActivityDays(maxDays = 7): Promise<ActivityDay[]> {
  const uid = getUid();
  const theDb = requireDb();
  if (!uid || !theDb) return [];

  const daysCol = collection(theDb, 'users', uid, 'days');
  const q = query(daysCol, orderBy('day', 'desc'), limit(Math.max(1, Math.min(7, maxDays))));
  const snaps = await getDocs(q);

  return snaps.docs.map((d) => {
    const data = d.data() as any;
    const day = data?.day instanceof Timestamp ? data.day : Timestamp.now();
    const rawEvents: any[] = Array.isArray(data?.events) ? data.events : [];
    const events = rawEvents.map(coerceEvent).filter(Boolean) as ActivityEvent[];
    // Sort newest-first within the day for UI convenience.
    events.sort((a, b) => b.ts.toMillis() - a.ts.toMillis());
    return { id: d.id, day, events };
  });
}
