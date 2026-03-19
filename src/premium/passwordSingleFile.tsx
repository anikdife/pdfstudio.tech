import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, firebaseEnabled } from '../services/firebaseClient';
import { onAuthStateChangedListener, type FirebaseIdentity } from '../services/firebaseAuth';
import { AccountButton } from '../app/layout/AccountButton';
import { FeedbackOverlay } from '../components/feedback/FeedbackOverlay';

type FormPlacementMode = 'text' | 'multiline' | 'date' | 'dropdown' | 'radio_yes_no' | 'checkbox' | null;

type FormFieldPreview = {
  uid: string;
  type: Exclude<FormPlacementMode, null>;
  name: string;
  value?: string | boolean | null;
  options?: string[];
  x: number; // px from left (top-left coordinate space)
  y: number; // px from top
  w: number;
  h: number;
};

function sanitizeFieldName(raw: string) {
  const trimmed = raw.trim();
  // Keep names simple for broad PDF viewer compatibility.
  const safe = trimmed.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
  return safe;
}

function nextUniqueName(existing: Set<string>, base: string) {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(16)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={path} />
    </svg>
  );
}

type ResumeTemplateId = 'modern-dark' | 'ats' | 'executive' | 'creative';

const RESUME_TEMPLATES: Array<{
  id: ResumeTemplateId;
  title: string;
  subtitle: string;
  iconPath?: string;
}> = [
  {
    id: 'modern-dark',
    title: 'Modern Dark',
    subtitle: 'Glassy dark blocks, bold headings, modern spacing.',
    iconPath: 'M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 12h10v2H7v-2zm0 4h10v2H7v-2zm0-8h6v2H7V8z',
  },
  {
    id: 'ats',
    title: 'ATS Clean',
    subtitle: 'Recruiter-friendly, ultra-readable layouts.',
    iconPath: 'M12 2l2.2 6.6L21 11l-6.4 2.2L12 20l-2.6-6.8L3 11l6.8-2.4L12 2z',
  },
  {
    id: 'executive',
    title: 'Executive',
    subtitle: 'Classic, conservative, leadership-ready.',
    iconPath: 'M4 6h16v2H4V6zm2 4h12v2H6v-2zm-2 4h16v2H4v-2zm2 4h12v2H6v-2z',
  },
  {
    id: 'creative',
    title: 'Creative',
    subtitle: 'Portfolio-first, visuals + sections.',
    iconPath: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 0 1 6.5 4.5H12V5zm0 14a7 7 0 0 1-6.5-4.5H12V19zm0-6.5H5.1A7 7 0 0 1 5 12c0-.2 0-.3.02-.5H12V12.5zm7.88-1H12V11.5h7c.02.17.02.33.02.5 0 .34-.05.67-.14 1z',
  },
];

const IType = () => (
  <Icon path="M6 4h12v2H13v14h-2V6H6V4z" />
);
const IMultiline = () => (
  <Icon path="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z" />
);
const ICalendar = () => (
  <Icon path="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm12 6H5v12h14V8z" />
);
const IDropdown = () => (
  <Icon path="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2zm11-2 4 4-1.4 1.4L17.2 15 13.8 18.4 12.4 17l4-4z" />
);
const IRadio = () => (
  <Icon path="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm0-11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
);
const ICheck = () => (
  <Icon path="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5.6 11.2 7-7 1.4 1.4-8.4 8.4L6 12.8l1.4-1.4 3.2 3.2z" />
);
const ISave = () => (
  <Icon path="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-1 2.4L18.6 8H6V5h10zM6 20v-8h12v8H6z" />
);
const IDownload = () => (
  <Icon path="M12 3a1 1 0 0 1 1 1v8.6l2.3-2.3 1.4 1.4-4 4a1 1 0 0 1-1.4 0l-4-4 1.4-1.4L11 12.6V4a1 1 0 0 1 1-1zm-7 15h14v2H5v-2z" />
);
const ISend = () => (
  <Icon path="M2 21 23 12 2 3v7l15 2-15 2v7z" />
);
const IX = () => (
  <Icon path="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z" />
);
const IFilePlus = () => (
  <Icon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.8L19.2 10H14V4.8zM11 12h2v3h3v2h-3v3h-2v-3H8v-2h3v-3z" />
);

let qpdfModulePromise: Promise<any> | null = null;

async function getQpdfModule(): Promise<any> {
  if (!qpdfModulePromise) {
    qpdfModulePromise = (async () => {
      // Use stable public URLs so the pthread worker can load the same module script and
      // resolve qpdf.wasm reliably (Vite hashed assets break Emscripten's default resolution).
      const qpdfScriptUrl = new URL('/qpdf/qpdf.js', window.location.href).toString();
      const mod = await import(/* @vite-ignore */ qpdfScriptUrl);
      const init = (mod as any)?.default;
      if (typeof init !== 'function') {
        throw new Error('Failed to load qpdf-wasm.');
      }
      return await init({
        locateFile: (file: string) => {
          return `/qpdf/${file}`;
        },
      });
    })();
  }
  return qpdfModulePromise;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

type QuotaState =
  | { kind: 'unknown' }
  | { kind: 'ok'; count: number; limit: number; date: string }
  | { kind: 'limit'; count: number; limit: number; date: string }
  | { kind: 'error'; message: string };

function todayId(): string {
  // Use YYYY-MM-DD; ISO is UTC but stable and matches requirement examples.
  return new Date().toISOString().slice(0, 10);
}

function randomOwnerPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptPdfWithQpdfWasm(inputBytes: Uint8Array, userPw: string, ownerPw: string): Promise<Uint8Array> {
  const qpdf = await withTimeout(getQpdfModule(), 20000, 'qpdf init');
  const fs = (qpdf as any)?.FS;
  const callMain = (qpdf as any)?.callMain;
  if (!fs || typeof fs.writeFile !== 'function' || typeof fs.readFile !== 'function') {
    throw new Error('qpdf-wasm FS is unavailable.');
  }
  if (typeof callMain !== 'function') {
    throw new Error('qpdf-wasm callMain is unavailable.');
  }

  const rand = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
  const inPath = `/tmp/in-${rand}.pdf`;
  const outPath = `/tmp/out-${rand}.pdf`;

  try {
    fs.writeFile(inPath, inputBytes);

    // qpdf CLI: --encrypt <user> <owner> <keylen> [perm flags] -- <infile> <outfile>
    // Permissions mapping (best-effort): printing low-res, no modify, no extract/copy.
    const args = [
      '--encrypt',
      userPw,
      ownerPw,
      '256',
      '--print=low',
      '--modify=none',
      '--extract=n',
      '--annotate=n',
      '--',
      inPath,
      outPath,
    ];

    try {
      callMain(args);
    } catch (e: any) {
      // Emscripten frequently throws ExitStatus on non-zero exit.
      const msg = e?.message || String(e);
      throw new Error(`qpdf failed: ${msg}`);
    }

    const out = fs.readFile(outPath);
    if (!(out instanceof Uint8Array)) {
      // Some FS implementations return Buffer-like; normalize.
      return new Uint8Array(out);
    }
    return out;
  } finally {
    try {
      fs.unlink(inPath);
    } catch {
      // ignore
    }
    try {
      fs.unlink(outPath);
    } catch {
      // ignore
    }
  }
}

function downloadBytes(bytes: Uint8Array<ArrayBufferLike>, filename: string) {
  // qpdf-wasm may return a Uint8Array backed by SharedArrayBuffer.
  // BlobPart typing requires an ArrayBuffer-backed view, so copy first.
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTextFile(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PasswordSingleFile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formFileInputRef = useRef<HTMLInputElement | null>(null);

  const [identity, setIdentity] = useState<FirebaseIdentity>({
    uid: null,
    displayName: null,
    email: null,
    photoURL: null,
    isLoggedIn: false,
  });

  const [quota, setQuota] = useState<QuotaState>({ kind: 'unknown' });
  const dailyLimit = 2;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userPassword, setUserPassword] = useState('');

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // PDF Form Builder state (independent from password tool)
  const FORM_W = 600;
  const FORM_H = 800;
  const [formPlacementMode, setFormPlacementMode] = useState<FormPlacementMode>(null);
  const [formProcessing, setFormProcessing] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldPreview[]>([]);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedFieldNameDraft, setSelectedFieldNameDraft] = useState('');
  const [addFieldsOpen, setAddFieldsOpen] = useState(false);
  const [addButtonsOpen, setAddButtonsOpen] = useState(false);
  const [submitEmailDraft, setSubmitEmailDraft] = useState('');
  const [submitEmailSaved, setSubmitEmailSaved] = useState<string>('');
  const [downloadActionEnabled, setDownloadActionEnabled] = useState(false);
  const [submitActionEnabled, setSubmitActionEnabled] = useState(false);
  const formPdfRef = useRef<PDFDocument | null>(null);
  const formPageIndexRef = useRef<number>(0);
  const addFieldsBtnRef = useRef<HTMLButtonElement | null>(null);
  const addFieldsMenuRef = useRef<HTMLDivElement | null>(null);
  const addButtonsBtnRef = useRef<HTMLButtonElement | null>(null);
  const addButtonsMenuRef = useRef<HTMLDivElement | null>(null);
  const fieldEditNameInputRef = useRef<HTMLInputElement | null>(null);
  const submitEmailBottomInputRef = useRef<HTMLInputElement | null>(null);

  const selectedField = useMemo(
    () => (selectedFieldUid ? formFields.find((f) => f.uid === selectedFieldUid) ?? null : null),
    [formFields, selectedFieldUid],
  );

  useEffect(() => {
    // Initialize submit email from localStorage, falling back to env if present.
    const fromStorage = (() => {
      try {
        return localStorage.getItem('xpdf.formSubmitEmail') ?? '';
      } catch {
        return '';
      }
    })();
    const fromEnv = (((import.meta as any).env?.VITE_FORM_SUBMIT_EMAIL as string | undefined) ?? '').trim();
    const initial = (fromStorage || fromEnv).trim();
    setSubmitEmailSaved(initial);
    setSubmitEmailDraft(initial);
  }, []);

  useEffect(() => {
    if (!selectedFieldUid) return;
    const f = formFields.find((ff) => ff.uid === selectedFieldUid) ?? null;
    if (!f) return;
    setSelectedFieldNameDraft(f.name);
    // Focus after render so rename is immediate.
    const t = window.setTimeout(() => {
      fieldEditNameInputRef.current?.focus();
      fieldEditNameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectedFieldUid, formFields]);

  const saveSubmitEmail = () => {
    const email = submitEmailDraft.trim();
    // Lightweight validation: must contain a single @ and at least one dot after.
    const ok = /^\S+@\S+\.\S+$/.test(email);
    if (!ok) {
      setFormError('Please enter a valid email (e.g. name@domain.com).');
      return;
    }
    setFormError(null);
    setSubmitEmailSaved(email);
    try {
      localStorage.setItem('xpdf.formSubmitEmail', email);
    } catch {
      // ignore
    }
    setFormNotice('Submit email saved to this form.');
  };

  useEffect(() => {
    if (!addFieldsOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const btn = addFieldsBtnRef.current;
      const menu = addFieldsMenuRef.current;
      if (btn?.contains(target)) return;
      if (menu?.contains(target)) return;
      setAddFieldsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [addFieldsOpen]);

  useEffect(() => {
    if (!addButtonsOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const btn = addButtonsBtnRef.current;
      const menu = addButtonsMenuRef.current;
      if (btn?.contains(target)) return;
      if (menu?.contains(target)) return;
      setAddButtonsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [addButtonsOpen]);

  const ensureFormDoc = async (): Promise<PDFDocument> => {
    if (formPdfRef.current) return formPdfRef.current;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([FORM_W, FORM_H]);
    formPdfRef.current = pdfDoc;
    formPageIndexRef.current = 0;
    setFormFields([]);
    setSelectedFieldUid(null);
    setDownloadActionEnabled(false);
    setSubmitActionEnabled(false);
    return pdfDoc;
  };

  const resetFormDoc = async () => {
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([FORM_W, FORM_H]);
      formPdfRef.current = pdfDoc;
      formPageIndexRef.current = 0;
      setFormFields([]);
      setFormPlacementMode(null);
      setSelectedFieldUid(null);
      setDownloadActionEnabled(false);
      setSubmitActionEnabled(false);
      setFormNotice('Started a new blank form. Choose a tool and click to place fields.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create a blank PDF');
    } finally {
      setFormProcessing(false);
    }
  };

  const loadPdfIntoFormBuilder = async (file: File) => {
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(bytes);
      if (pdfDoc.getPageCount() === 0) pdfDoc.addPage([FORM_W, FORM_H]);
      formPdfRef.current = pdfDoc;
      formPageIndexRef.current = 0;
      setFormFields([]);
      setFormPlacementMode(null);
      setSelectedFieldUid(null);
      setDownloadActionEnabled(false);
      setSubmitActionEnabled(false);
      setFormNotice('PDF loaded. Choose a tool and click to place fields on page 1.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to load PDF');
    } finally {
      setFormProcessing(false);
    }
  };

  const addFieldToPdf = async (xFromLeft: number, yFromTop: number) => {
    if (!formPlacementMode) return;
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await ensureFormDoc();
      const pageIndex = Math.max(0, Math.min(formPageIndexRef.current, pdfDoc.getPageCount() - 1));
      const page = pdfDoc.getPage(pageIndex);
      const form = pdfDoc.getForm();

      const uid = `${formPlacementMode}.${Date.now().toString(16)}.${Math.random().toString(16).slice(2)}`;
      const existingNames = new Set(formFields.map((f) => f.name));
      const defaultBase =
        formPlacementMode === 'text'
          ? 'text_field'
          : formPlacementMode === 'multiline'
            ? 'textarea'
            : formPlacementMode === 'date'
              ? 'date'
              : formPlacementMode === 'dropdown'
                ? 'select'
                : formPlacementMode === 'radio_yes_no'
                  ? 'choice'
                  : 'checkbox';
      const name = nextUniqueName(existingNames, defaultBase);

      const dims = (() => {
        switch (formPlacementMode) {
          case 'text':
            return { w: 260, h: 34 };
          case 'multiline':
            return { w: 340, h: 120 };
          case 'date':
            return { w: 180, h: 34 };
          case 'dropdown':
            return { w: 240, h: 34 };
          case 'radio_yes_no':
            return { w: 210, h: 56 };
          case 'checkbox':
            return { w: 24, h: 24 };
          default:
            return { w: 260, h: 34 };
        }
      })();

      const w = dims.w;
      const h = dims.h;

      const x = Math.max(8, Math.min(Math.round(xFromLeft), FORM_W - w - 8));
      const yTop = Math.max(8, Math.min(Math.round(yFromTop), FORM_H - h - 8));
      const y = FORM_H - yTop - h; // pdf-lib uses bottom-left origin

      if (formPlacementMode === 'text') {
        const tf = form.createTextField(name);
        tf.setText('');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (formPlacementMode === 'multiline') {
        const tf = form.createTextField(name);
        tf.enableMultiline();
        tf.setText('');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (formPlacementMode === 'date') {
        const tf = form.createTextField(name);
        tf.setMaxLength(10);
        tf.setText('');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (formPlacementMode === 'dropdown') {
        const dd = form.createDropdown(name);
        const options = ['Option 1', 'Option 2', 'Option 3'];
        dd.setOptions(options);
        dd.select(options[0]);
        dd.addToPage(page, { x, y, width: w, height: h });
      } else if (formPlacementMode === 'radio_yes_no') {
        // Place a small 2-option group (Yes/No) at the click location.
        const group = form.createRadioGroup(name);
        const optW = 18;
        const optH = 18;
        const yesYTop = yTop + 8;
        const noYTop = yTop + 32;
        const yesY = FORM_H - yesYTop - optH;
        const noY = FORM_H - noYTop - optH;
        group.addOptionToPage('Yes', page, { x, y: yesY, width: optW, height: optH });
        group.addOptionToPage('No', page, { x, y: noY, width: optW, height: optH });
      } else {
        const cb = form.createCheckBox(name);
        cb.addToPage(page, { x, y, width: w, height: h });
      }

      try {
        // Helps many PDF viewers render form widgets nicely.
        form.updateFieldAppearances();
      } catch {
        // ignore
      }

      const seedValue: FormFieldPreview['value'] =
        formPlacementMode === 'checkbox'
          ? false
          : formPlacementMode === 'radio_yes_no'
            ? null
            : formPlacementMode === 'dropdown'
              ? 'Option 1'
              : '';
      const seedOptions: FormFieldPreview['options'] =
        formPlacementMode === 'dropdown'
          ? ['Option 1', 'Option 2', 'Option 3']
          : formPlacementMode === 'radio_yes_no'
            ? ['Yes', 'No']
            : undefined;

      setFormFields((prev) => [...prev, { uid, type: formPlacementMode, name, value: seedValue, options: seedOptions, x, y: yTop, w, h }]);
      setSelectedFieldUid(uid);
      setSelectedFieldNameDraft(name);
      setFormNotice(`Field added: ${name}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add field');
    } finally {
      setFormProcessing(false);
    }
  };

  const renameSelectedField = async () => {
    if (!selectedFieldUid) return;
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await ensureFormDoc();
      const form = pdfDoc.getForm();
      const pageIndex = Math.max(0, Math.min(formPageIndexRef.current, pdfDoc.getPageCount() - 1));
      const page = pdfDoc.getPage(pageIndex);

      const field = formFields.find((f) => f.uid === selectedFieldUid) ?? null;
      if (!field) return;

      const raw = selectedFieldNameDraft;
      const sanitized = sanitizeFieldName(raw);
      if (!sanitized) {
        setFormError('Field name is required.');
        return;
      }

      if (sanitized === field.name) {
        setFormNotice('No changes to field name.');
        return;
      }

      const existingNames = new Set(formFields.filter((f) => f.uid !== field.uid).map((f) => f.name));
      if (existingNames.has(sanitized)) {
        setFormError('That field name is already used.');
        return;
      }

      // Recreate the PDF field with a new name; pdf-lib does not provide a direct rename.
      const x = field.x;
      const w = field.w;
      const h = field.h;
      const y = FORM_H - field.y - h;

      const existingValue = field.value;
      const existingOptions = field.options;

      if (field.type === 'text') {
        const tf = form.createTextField(sanitized);
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'multiline') {
        const tf = form.createTextField(sanitized);
        tf.enableMultiline();
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'date') {
        const tf = form.createTextField(sanitized);
        tf.setMaxLength(10);
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'dropdown') {
        const dd = form.createDropdown(sanitized);
        const opts = existingOptions?.length ? existingOptions : ['Option 1', 'Option 2', 'Option 3'];
        dd.setOptions(opts);
        const v = typeof existingValue === 'string' ? existingValue : '';
        if (v) dd.select(v);
        else dd.select(opts[0]);
        dd.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'radio_yes_no') {
        const group = form.createRadioGroup(sanitized);
        const optW = 18;
        const optH = 18;
        const yesYTop = field.y + 8;
        const noYTop = field.y + 32;
        const yesY = FORM_H - yesYTop - optH;
        const noY = FORM_H - noYTop - optH;
        group.addOptionToPage('Yes', page, { x, y: yesY, width: optW, height: optH });
        group.addOptionToPage('No', page, { x, y: noY, width: optW, height: optH });
        const v = typeof existingValue === 'string' ? existingValue : '';
        if (v) group.select(v);
      } else {
        const cb = form.createCheckBox(sanitized);
        cb.addToPage(page, { x, y, width: w, height: h });
        if (existingValue === true) cb.check();
      }

      try {
        const old = form.getField(field.name);
        form.removeField(old);
      } catch {
        // ignore
      }

      try {
        form.updateFieldAppearances();
      } catch {
        // ignore
      }

      setFormFields((prev) => prev.map((f) => (f.uid === field.uid ? { ...f, name: sanitized } : f)));
      setSelectedFieldNameDraft(sanitized);
      setFormNotice(`Renamed field to ${sanitized}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to rename field');
    } finally {
      setFormProcessing(false);
    }
  };

  const deleteSelectedField = async () => {
    if (!selectedFieldUid) return;
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await ensureFormDoc();
      const form = pdfDoc.getForm();
      const field = formFields.find((f) => f.uid === selectedFieldUid) ?? null;
      if (!field) return;

      try {
        const toRemove = form.getField(field.name);
        form.removeField(toRemove);
      } catch {
        // ignore
      }

      setFormFields((prev) => prev.filter((f) => f.uid !== field.uid));
      setSelectedFieldUid(null);
      setSelectedFieldNameDraft('');
      setFormNotice('Field removed.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to remove field');
    } finally {
      setFormProcessing(false);
    }
  };

  const moveSelectedField = async (dx: number, dy: number) => {
    if (!selectedFieldUid) return;
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const field = formFields.find((f) => f.uid === selectedFieldUid) ?? null;
      if (!field) return;

      const newX = clamp(field.x + dx, 8, FORM_W - field.w - 8);
      const newY = clamp(field.y + dy, 8, FORM_H - field.h - 8);
      if (newX === field.x && newY === field.y) return;

      const pdfDoc = await ensureFormDoc();
      const form = pdfDoc.getForm();
      const pageIndex = Math.max(0, Math.min(formPageIndexRef.current, pdfDoc.getPageCount() - 1));
      const page = pdfDoc.getPage(pageIndex);

      // Remove old widget then recreate at the new position.
      try {
        const old = form.getField(field.name);
        form.removeField(old);
      } catch {
        // ignore
      }

      const x = newX;
      const y = FORM_H - newY - field.h;
      const w = field.w;
      const h = field.h;
      const existingValue = field.value;
      const existingOptions = field.options;

      if (field.type === 'text') {
        const tf = form.createTextField(field.name);
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'multiline') {
        const tf = form.createTextField(field.name);
        tf.enableMultiline();
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'date') {
        const tf = form.createTextField(field.name);
        tf.setMaxLength(10);
        tf.setText(typeof existingValue === 'string' ? existingValue : '');
        tf.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'dropdown') {
        const dd = form.createDropdown(field.name);
        const opts = existingOptions?.length ? existingOptions : ['Option 1', 'Option 2', 'Option 3'];
        dd.setOptions(opts);
        const v = typeof existingValue === 'string' ? existingValue : '';
        if (v) dd.select(v);
        else dd.select(opts[0]);
        dd.addToPage(page, { x, y, width: w, height: h });
      } else if (field.type === 'radio_yes_no') {
        const group = form.createRadioGroup(field.name);
        const optW = 18;
        const optH = 18;
        const yesYTop = newY + 8;
        const noYTop = newY + 32;
        const yesY = FORM_H - yesYTop - optH;
        const noY = FORM_H - noYTop - optH;
        group.addOptionToPage('Yes', page, { x, y: yesY, width: optW, height: optH });
        group.addOptionToPage('No', page, { x, y: noY, width: optW, height: optH });
        const v = typeof existingValue === 'string' ? existingValue : '';
        if (v) group.select(v);
      } else {
        const cb = form.createCheckBox(field.name);
        cb.addToPage(page, { x, y, width: w, height: h });
        if (existingValue === true) cb.check();
      }

      try {
        form.updateFieldAppearances();
      } catch {
        // ignore
      }

      setFormFields((prev) => prev.map((f) => (f.uid === field.uid ? { ...f, x: newX, y: newY } : f)));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to move field');
    } finally {
      setFormProcessing(false);
    }
  };

  const downloadFormPdf = async () => {
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await ensureFormDoc();
      // Save a copy so we can draw visible labels without mutating the live builder doc
      // (and without duplicating labels across multiple downloads).
      const baseBytes = await pdfDoc.save();
      const outDoc = await PDFDocument.load(baseBytes);

      // Optional: add a visible "Download JSON" push-button into the downloaded PDF.
      // Note: PDF viewers typically sandbox button actions; we add the button for visibility/UX.
      let helvetica: any = null;
      try {
        helvetica = await outDoc.embedFont(StandardFonts.Helvetica);
      } catch {
        // ignore
      }

      if (downloadActionEnabled) {
        try {
          const pageIndex = Math.max(0, Math.min(formPageIndexRef.current, outDoc.getPageCount() - 1));
          const page = outDoc.getPage(pageIndex);
          const { width, height } = page.getSize();

          const btnW = 168;
          const btnH = 28;
          const x = clamp(width - btnW - 14, 8, width - btnW - 8);
          const y = clamp(14, 8, height - btnH - 8);

          const form = outDoc.getForm();
          const button = form.createButton('xpdf.action.download_json');
          button.addToPage('Download JSON', page, {
            x,
            y,
            width: btnW,
            height: btnH,
            font: helvetica ?? undefined,
            textColor: rgb(0.08, 0.10, 0.12),
            backgroundColor: rgb(0.95, 0.96, 0.98),
            borderColor: rgb(0.65, 0.70, 0.78),
            borderWidth: 1,
          } as any);

          try {
            if (helvetica) button.defaultUpdateAppearances(helvetica);
          } catch {
            // ignore
          }

          // Acrobat-compatible JavaScript action: export all field values as JSON.
          // Note: Most browser PDF viewers do NOT run PDF JavaScript.
          try {
            const js = `(() => {\n` +
              `  try {\n` +
              `    var out = {};\n` +
              `    for (var i = 0; i < this.numFields; i++) {\n` +
              `      var n = this.getNthFieldName(i);\n` +
              `      if (!n || n === 'xpdf.action.download_json') continue;\n` +
              `      var f = this.getField(n);\n` +
              `      if (!f) continue;\n` +
              `      out[n] = f.value;\n` +
              `    }\n` +
              `    var json = JSON.stringify(out, null, 2);\n` +
              `    var name = 'xpdf-form-data.json';\n` +
              `    try { this.removeDataObject(name); } catch (e) {}\n` +
              `    this.createDataObject({ cName: name, cValue: json });\n` +
              `    this.exportDataObject({ cName: name, nLaunch: 2 });\n` +
              `  } catch (e) {\n` +
              `    try { app.alert('Export failed: ' + e); } catch (_) {}\n` +
              `  }\n` +
              `})();`;

            const action = outDoc.context.obj({
              Type: 'Action',
              S: 'JavaScript',
              JS: PDFString.of(js),
            });

            const widgets = (button as any).acroField?.getWidgets?.() ?? [];
            for (const w of widgets) {
              try {
                (w as any).dict?.set(PDFName.of('A'), action);
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
      }

      try {
        outDoc.getForm().updateFieldAppearances();
      } catch {
        // ignore
      }

      // Make the internal field names visible in the downloaded PDF by drawing labels.
      // PDF "field name" is metadata, so most viewers won't display it automatically.
      try {
        const pageIndex = Math.max(0, Math.min(formPageIndexRef.current, outDoc.getPageCount() - 1));
        const page = outDoc.getPage(pageIndex);
        const { height } = page.getSize();
        const fontSize = 9;

        for (const f of formFields) {
          const label = (f.name ?? '').trim();
          if (!label) continue;
          const x = clamp(f.x, 6, 10_000);
          // Our UI uses top-left coords; PDF uses bottom-left. Place label slightly above the field.
          const yFromBottom = height - f.y + 6;
          const y = clamp(yFromBottom, 6, height - fontSize - 6);

          page.drawText(label, {
            x,
            y,
            size: fontSize,
            font: helvetica ?? undefined,
            color: rgb(0.15, 0.23, 0.35),
          });
        }
      } catch {
        // If label rendering fails for any reason, still allow downloading the form.
      }

      const outBytes = await outDoc.save();
      downloadBytes(new Uint8Array(outBytes), 'xpdf-form.pdf');
      setFormNotice('Downloaded PDF form.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save PDF');
    } finally {
      setFormProcessing(false);
    }
  };

  const readLiveValueFromPdf = (pdfDoc: PDFDocument | null, field: FormFieldPreview) => {
    if (!pdfDoc) return field.value ?? null;
    try {
      const form = pdfDoc.getForm();
      if (field.type === 'text' || field.type === 'multiline' || field.type === 'date') {
        const tf = form.getTextField(field.name);
        return tf.getText() ?? '';
      }
      if (field.type === 'dropdown') {
        const dd = form.getDropdown(field.name);
        const selected = (dd as any).getSelected?.();
        if (Array.isArray(selected)) return selected[0] ?? null;
        return (selected ?? null) as any;
      }
      if (field.type === 'radio_yes_no') {
        const rg = form.getRadioGroup(field.name);
        const selected = (rg as any).getSelected?.();
        return (selected ?? null) as any;
      }
      const cb = form.getCheckBox(field.name);
      return cb.isChecked();
    } catch {
      return field.value ?? null;
    }
  };

  const buildFormJson = (pdfDocOverride?: PDFDocument | null) => {
    const pdfDoc = pdfDocOverride ?? formPdfRef.current;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      page: { width: FORM_W, height: FORM_H, unit: 'px' as const },
      actions: {
        downloadEnabled: downloadActionEnabled,
        submitEnabled: submitActionEnabled,
        submitEmail: submitEmailSaved || null,
      },
      fields: formFields.map((f) => ({
        name: f.name,
        type: f.type,
        value: readLiveValueFromPdf(pdfDoc, f),
        options: f.options ?? null,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
      })),
    };
    return {
      payload,
      json: JSON.stringify(payload, null, 2),
    };
  };

  const downloadFormJson = async () => {
    setFormError(null);
    setFormNotice(null);
    setFormProcessing(true);
    try {
      const pdfDoc = await ensureFormDoc();
      const { json } = buildFormJson(pdfDoc);
      downloadTextFile(json, 'xpdf-form.json', 'application/json');
      setFormNotice('Downloaded form JSON.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to export JSON');
    } finally {
      setFormProcessing(false);
    }
  };

  const submitFormJsonViaEmail = async () => {
    setFormError(null);
    setFormNotice(null);
    try {
      const submitEmail = (submitEmailSaved || (((import.meta as any).env?.VITE_FORM_SUBMIT_EMAIL as string | undefined) ?? '')).trim();
      if (!submitEmail) {
        setFormError('Submit email not set. Enter an email under Submit and click Save.');
        return;
      }

      const pdfDoc = await ensureFormDoc();
      const { json } = buildFormJson(pdfDoc);

      // Best-effort: copy JSON to clipboard for reliability (mailto bodies can be length-limited).
      try {
        await navigator.clipboard.writeText(json);
      } catch {
        // ignore
      }

      const subject = 'XPDF form JSON submission';
      const bodyTooLarge = json.length > 6000;
      const body = bodyTooLarge
        ? 'Form JSON is ready. Please attach the downloaded xpdf-form.json (the JSON may also be on your clipboard).'
        : json;

      const mailto = `mailto:${encodeURIComponent(submitEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      setFormNotice(bodyTooLarge ? 'Opened email composer (JSON copied; attach file if needed).' : 'Opened email composer with JSON.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to submit via email');
    }
  };

  const canUseFirebase = firebaseEnabled && !!auth && !!db;

  useEffect(() => {
    const unsub = onAuthStateChangedListener((id) => setIdentity(id));
    return () => unsub();
  }, []);

  const studio = useMemo(() => {
    const bg = '#071023';
    const panel = 'rgba(255,255,255,0.08)';
    const panelBorder = 'rgba(255,255,255,0.18)';
    const text = 'rgba(255,255,255,0.92)';
    const muted = 'rgba(255,255,255,0.68)';
    const amber = '#fbbf24';
    return { bg, panel, panelBorder, text, muted, amber };
  }, []);

  async function fetchQuotaForTodayOrZero(uid: string): Promise<{ count: number; date: string }> {
    if (!db) throw new Error('Firestore is not available.');
    const date = todayId();

    // Firestore path must alternate collection/doc. We store daily usage docs under:
    // users/{uid}/usage/pdf_passwords/daily/{YYYY-MM-DD}
    const ref = doc(db, 'users', uid, 'usage', 'pdf_passwords', 'daily', date);

    const snap = await getDoc(ref);
    const count = snap.exists() && typeof (snap.data() as any)?.count === 'number' ? (snap.data() as any).count : 0;
    return { count, date };
  }

  async function handlePickClick() {
    setError(null);
    setNotice(null);

    // 1) Auth guard
    if (!identity.isLoggedIn || !identity.uid) {
      navigate('/login');
      return;
    }

    // 2) Quota guard (before opening picker)
    if (!canUseFirebase) {
      setQuota({ kind: 'error', message: 'Firebase is not configured; cannot verify quota.' });
      return;
    }

    try {
      const { count, date } = await fetchQuotaForTodayOrZero(identity.uid);
      if (count >= dailyLimit) {
        setQuota({ kind: 'limit', count, limit: dailyLimit, date });
        return;
      }
      setQuota({ kind: 'ok', count, limit: dailyLimit, date });
      fileInputRef.current?.click();
    } catch (e: any) {
      setQuota({ kind: 'error', message: e?.message || 'Failed to check quota.' });
    }
  }

  async function incrementQuota(uid: string) {
    if (!db) throw new Error('Firestore is not available.');
    const date = todayId();
    const ref = doc(db, 'users', uid, 'usage', 'pdf_passwords', 'daily', date);

    await setDoc(
      ref,
      {
        count: increment(1),
        updatedAt: serverTimestamp(),
      } as any,
      { merge: true },
    );
  }

  async function handleEncrypt() {
    setError(null);
    setNotice(null);

    if (!selectedFile) {
      setError('Please choose a PDF file first.');
      return;
    }
    if (!userPassword.trim()) {
      setError('Please enter a password.');
      return;
    }

    if (!identity.isLoggedIn || !identity.uid) {
      navigate('/login');
      return;
    }

    setProcessing(true);

    let encryptedBytes: Uint8Array | null = null;

    try {
      const bytes = new Uint8Array(await selectedFile.arrayBuffer());

      // 3) PDF processing
      // pdf-lib is kept here as a best-effort validation step (and to satisfy the project constraint).
      // Actual encryption is performed by qpdf-wasm, since pdf-lib v1.17.x does not implement encryption.
      try {
        await PDFDocument.load(bytes, { ignoreEncryption: true } as any);
      } catch {
        // If parsing fails here, qpdf may still succeed; continue.
      }

      const ownerPassword = randomOwnerPassword();
      encryptedBytes = await encryptPdfWithQpdfWasm(bytes, userPassword, ownerPassword);

      const outName = selectedFile.name.replace(/\.pdf$/i, '') + '-protected.pdf';
      downloadBytes(encryptedBytes, outName);

      // 3b) Usage increment (atomic)
      if (canUseFirebase) {
        try {
          await incrementQuota(identity.uid);
          // best-effort refresh quota UI
          const { count, date } = await fetchQuotaForTodayOrZero(identity.uid);
          setQuota(count >= dailyLimit ? { kind: 'limit', count, limit: dailyLimit, date } : { kind: 'ok', count, limit: dailyLimit, date });
        } catch (e: any) {
          // Important: PDF is already processed and downloaded.
          setNotice(
            `PDF secured, but usage counter could not be updated: ${
              e?.message || 'unknown Firestore error'
            }. You may be asked to upgrade sooner than expected.`,
          );
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to encrypt PDF.');
    } finally {
      setProcessing(false);
    }
  }

  const limitReached = quota.kind === 'limit';

  return (
    <div
      className="pwPage"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: `radial-gradient(1200px 700px at 15% 10%, rgba(59,130,246,0.20), transparent 60%), radial-gradient(900px 600px at 85% 20%, rgba(251,191,36,0.12), transparent 55%), ${studio.bg}`,
        color: studio.text,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <style>{`
        @keyframes xpdfSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }

        /* =========================
           AccountButton (scoped to /pw)
           ========================= */
        .pwPage .firebaseAccountBtn.button-30 {
          /* Override the global light button-30 style so it matches this page */
          font-family: inherit;
          background: rgba(2,6,23,0.52);
          color: rgba(255,255,255,0.92);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px;
          height: 42px;
          min-width: 42px;
          padding: 0 12px;
          box-shadow:
            0 18px 60px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.06) inset;
          backdrop-filter: blur(14px);
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .pwPage .firebaseAccountBtn.button-30:hover {
          background: rgba(2,6,23,0.66);
          border-color: rgba(251,191,36,0.40);
          transform: translateY(-1px);
          box-shadow:
            0 22px 72px rgba(0,0,0,0.62),
            0 0 0 1px rgba(251,191,36,0.10) inset;
        }

        .pwPage .firebaseAccountBtn.button-30:active {
          transform: translateY(0px);
          box-shadow:
            0 14px 44px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.06) inset;
        }

        .pwPage .firebaseAccountBtn.button-30:focus-visible {
          outline: 2px solid rgba(251,191,36,0.90);
          outline-offset: 3px;
        }

        .pwPage .firebaseAccountAvatar {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        }

        .pwPage .firebaseAccountInitials {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.6px;
          background:
            radial-gradient(14px 14px at 30% 30%, rgba(56,189,248,0.26), transparent 65%),
            rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
        }

        .pwPage .firebaseAccountMenu {
          right: 0;
          top: calc(100% + 10px);
          min-width: 190px;
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.16);
          background:
            radial-gradient(420px 220px at 20% 20%, rgba(56,189,248,0.16), transparent 60%),
            radial-gradient(420px 220px at 90% 10%, rgba(251,191,36,0.14), transparent 60%),
            rgba(2,6,23,0.72);
          backdrop-filter: blur(18px);
          box-shadow: 0 26px 90px rgba(0,0,0,0.70);
          z-index: 100;
        }

        .pwPage .firebaseAccountMenuItem {
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 850;
          letter-spacing: 0.2px;
          color: rgba(255,255,255,0.92);
        }

        .pwPage .firebaseAccountMenuItem:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(251,191,36,0.20);
        }

        .pwWrap {
          max-width: 860px;
          margin: 0 auto;
        }

        .pwTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 18px;
        }

        .pwTopRight {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Match /features top nav pills */
        .pwPage .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.78);
          font-size: 12px;
          box-shadow: none;
        }

        .pwPage .pill-warn {
          background: rgba(255,171,64,0.10);
          border-color: rgba(255,171,64,0.22);
          color: rgba(255,231,200,0.92);
        }

        .pwPage .pillLink{
          cursor: pointer;
          user-select: none;
        }

        .pwPage .pillLink:hover{
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-1px);
        }

        .pwPage .pillLink:active{
          transform: translateY(0px);
        }

        .pwPage .pillLink:focus-visible{
          outline: 2px solid rgba(88,166,255,0.80);
          outline-offset: 3px;
        }

        .pwNavBtn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          padding: 10px 12px;
          border-radius: 12px;
          cursor: pointer;
          backdrop-filter: blur(12px);
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
          font-weight: 800;
        }

        .pwNavBtn:hover {
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-1px);
        }

        .pwTitle {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.6px;
          line-height: 1.1;
        }

        .pwBadge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.78);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          backdrop-filter: blur(12px);
        }

        .pwSub {
          margin-top: 8px;
          color: rgba(255,255,255,0.72);
          font-size: 14px;
          line-height: 1.45;
        }

        .pwHomeBtn { /* legacy alias */ }

        .pwCard {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(255,255,255,0.18);
          background:
            radial-gradient(900px 420px at 20% 10%, rgba(56,189,248,0.16), transparent 55%),
            radial-gradient(880px 420px at 90% 15%, rgba(251,191,36,0.14), transparent 55%),
            radial-gradient(920px 560px at 50% 90%, rgba(255,255,255,0.07), transparent 60%),
            rgba(255,255,255,0.06);
          box-shadow:
            0 28px 120px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.06) inset;
          backdrop-filter: blur(18px);
        }

        .pwCard::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.10), transparent 35%),
            linear-gradient(225deg, rgba(255,255,255,0.08), transparent 35%);
          opacity: 0.55;
        }

        .pwCardInner {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }

        @media (min-width: 860px) {
          .pwCardInner {
            grid-template-columns: 1.05fr 0.95fr;
            gap: 18px;
          }
        }

        .pwSection {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(15,23,42,0.40);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.16) inset;
        }

        .pwSectionTitle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .pwKicker {
          color: rgba(255,255,255,0.68);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .pwRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .pwResumeSection {
          grid-column: 1 / -1;
        }

        .pwResumeHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .pwResumeTitle {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 950;
          color: rgba(255,255,255,0.92);
          letter-spacing: -0.2px;
        }

        .pwResumeDesc {
          margin-top: 6px;
          color: rgba(255,255,255,0.66);
          font-size: 13px;
          line-height: 1.45;
        }

        .pwResumeGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 14px;
        }

        @media (min-width: 720px) {
          .pwResumeGrid {
            grid-template-columns: 1fr 1fr;
          }
        }

        .pwResumeTile {
          width: 100%;
          text-align: left;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.16) inset;
          backdrop-filter: blur(16px);
          cursor: pointer;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
          color: rgba(255,255,255,0.88);
        }

        .pwResumeTile:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.085);
          border-color: rgba(255,255,255,0.22);
        }

        .pwResumeTile:active {
          transform: translateY(0px);
        }

        .pwResumeTile:focus-visible {
          outline: 2px solid rgba(251,191,36,0.55);
          outline-offset: 2px;
        }

        .pwResumeTileIcon {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(15,23,42,0.35);
          color: rgba(226,232,240,0.9);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.14) inset;
        }

        .pwResumeTileTitle {
          font-weight: 950;
          letter-spacing: -0.2px;
          color: rgba(255,255,255,0.92);
          line-height: 1.2;
        }

        .pwResumeTileSub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(255,255,255,0.64);
          line-height: 1.35;
        }

        .pwResumeOpen {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 950;
          color: rgba(251,191,36,0.92);
          letter-spacing: 0.2px;
          white-space: nowrap;
        }

        .pwBtnPrimary {
          background:
            linear-gradient(180deg, rgba(251,191,36,0.98), rgba(251,191,36,0.82));
          color: #0b1220;
          border: 1px solid rgba(0,0,0,0.10);
          padding: 11px 14px;
          border-radius: 14px;
          font-weight: 900;
          letter-spacing: 0.2px;
          cursor: pointer;
          box-shadow:
            0 14px 38px rgba(0,0,0,0.45),
            0 0 0 1px rgba(255,255,255,0.18) inset;
          transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease;
        }

        .pwBtnPrimary:hover {
          transform: translateY(-1px);
          filter: saturate(1.05);
          box-shadow:
            0 18px 56px rgba(0,0,0,0.52),
            0 0 0 1px rgba(255,255,255,0.22) inset;
        }

        .pwBtnPrimary:active {
          transform: translateY(0px);
        }

        .pwBtnPrimary[disabled] {
          cursor: not-allowed;
          opacity: 0.72;
          filter: grayscale(0.15);
          transform: none;
        }

        .pwBtnSecondary {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          padding: 11px 14px;
          border-radius: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .pwMeta {
          color: rgba(255,255,255,0.70);
          font-size: 13px;
        }

        .pwInput {
          flex: 1 1 260px;
          background: rgba(2,6,23,0.45);
          border: 1px solid rgba(255,255,255,0.16);
          color: rgba(255,255,255,0.92);
          border-radius: 14px;
          padding: 11px 12px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .pwInput:focus {
          border-color: rgba(251,191,36,0.42);
          box-shadow: 0 0 0 3px rgba(251,191,36,0.16);
          background: rgba(2,6,23,0.55);
        }

        .pwSpinner {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid rgba(17,24,39,0.25);
          border-top-color: #0b1220;
          animation: xpdfSpin 0.9s linear infinite;
          display: inline-block;
        }

        .pwCallout {
          margin-top: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
        }

        .pwCalloutTitle {
          font-weight: 900;
          letter-spacing: -0.2px;
        }

        .pwLink {
          display: inline-block;
          margin-top: 10px;
          color: rgba(251,191,36,0.98);
          font-weight: 900;
          text-decoration: none;
        }

        .pwAlertError {
          padding: 12px;
          border-radius: 14px;
          background: rgba(248,113,113,0.10);
          border: 1px solid rgba(248,113,113,0.30);
          color: rgba(248,113,113,0.96);
          font-size: 13px;
        }

        .pwAlertNotice {
          padding: 12px;
          border-radius: 14px;
          background: rgba(251,191,36,0.10);
          border: 1px solid rgba(251,191,36,0.28);
          color: rgba(251,191,36,0.95);
          font-size: 13px;
        }

        /* =========================
           Form Builder card (/pw)
           ========================= */
        .pwFormCard {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px;
          border: 1px solid rgba(255,255,255,0.18);
          background:
            radial-gradient(900px 420px at 18% 12%, rgba(56,189,248,0.15), transparent 55%),
            radial-gradient(880px 420px at 92% 18%, rgba(168,85,247,0.12), transparent 55%),
            radial-gradient(920px 560px at 50% 92%, rgba(255,255,255,0.07), transparent 60%),
            rgba(255,255,255,0.05);
          box-shadow:
            0 28px 120px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.06) inset;
          backdrop-filter: blur(18px);
          margin-top: 18px;
        }

        .pwFormHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .pwFormTitle {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 950;
          letter-spacing: -0.2px;
        }

        .pwFormSub {
          margin-top: 6px;
          color: rgba(255,255,255,0.70);
          font-size: 13px;
          line-height: 1.45;
        }

        .pwFormActions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .pwDropdown {
          position: relative;
          display: inline-flex;
        }

        .pwDropdownBtn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(2,6,23,0.38);
          color: rgba(255,255,255,0.92);
          padding: 10px 12px;
          font-weight: 950;
          cursor: pointer;
          backdrop-filter: blur(14px);
        }

        .pwDropdownBtn:hover {
          background: rgba(2,6,23,0.52);
          border-color: rgba(251,191,36,0.28);
        }

        .pwChevron {
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid rgba(255,255,255,0.80);
          margin-left: 2px;
          transform: translateY(1px);
        }

        .pwDropdownMenu {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          min-width: 220px;
          z-index: 200;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(2,6,23,0.72);
          box-shadow: 0 26px 90px rgba(0,0,0,0.55);
          backdrop-filter: blur(18px);
          overflow: hidden;
        }

        .pwDropdownItem {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 12px;
          border: 0;
          background: transparent;
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          font-weight: 950;
          text-align: left;
        }

        .pwDropdownItem:hover {
          background: rgba(255,255,255,0.07);
        }

        .pwDropdownMeta {
          margin-left: auto;
          font-size: 12px;
          color: rgba(255,255,255,0.60);
          font-weight: 900;
        }

        .pwDropdownDivider {
          height: 1px;
          background: rgba(255,255,255,0.10);
          margin: 6px 0;
        }

        .pwFormActionBar {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .pwFormActionCard {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(2,6,23,0.30);
          backdrop-filter: blur(18px);
          padding: 12px;
        }

        .pwFormActionTitle {
          font-weight: 950;
          letter-spacing: -0.2px;
          margin-bottom: 4px;
        }

        .pwFormActionSub {
          color: rgba(255,255,255,0.64);
          font-size: 12px;
          line-height: 1.35;
          margin-bottom: 10px;
        }

        .pwFormEmailBox {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          padding: 10px;
        }

        .pwFormEmailLabel {
          font-size: 11px;
          font-weight: 950;
          color: rgba(255,255,255,0.72);
          letter-spacing: 0.2px;
          margin-bottom: 8px;
        }

        .pwFormEmailRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }

        .pwFormEmailInput {
          width: 100%;
          border-radius: 12px;
          padding: 10px 10px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          font-weight: 900;
          outline: none;
          font-size: 12px;
        }

        .pwFormEmailInput:focus-visible {
          border-color: rgba(34,211,238,0.60);
          box-shadow: 0 0 0 4px rgba(34,211,238,0.16);
        }

        .pwFormEmailSave {
          border-radius: 12px;
          padding: 10px 10px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(34,211,238,0.16);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          cursor: pointer;
          white-space: nowrap;
        }

        .pwFormEmailSave:hover {
          background: rgba(34,211,238,0.22);
        }

        .pwFormEmailHint {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255,255,255,0.58);
          font-weight: 800;
          line-height: 1.35;
        }

        .pwFormBtn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(2,6,23,0.35);
          color: rgba(255,255,255,0.92);
          padding: 10px 12px;
          font-weight: 900;
          cursor: pointer;
          backdrop-filter: blur(14px);
        }

        .pwFormBtn:hover {
          background: rgba(2,6,23,0.50);
          border-color: rgba(251,191,36,0.28);
        }

        .pwFormBtnPrimary {
          background: linear-gradient(180deg, rgba(34,211,238,0.92), rgba(168,85,247,0.88));
          color: rgba(8,10,12,0.92);
          border-color: rgba(255,255,255,0.10);
          box-shadow:
            0 16px 56px rgba(0,0,0,0.42),
            0 0 0 1px rgba(255,255,255,0.12) inset;
        }

        .pwFormBtnPrimary:hover {
          filter: brightness(1.05);
        }

        .pwFormCanvasWrap {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(2,6,23,0.30);
          padding: 14px;
          overflow: auto;
        }

        .pwFormPage {
          width: 600px;
          height: 800px;
          background: rgba(255,255,255,0.98);
          border-radius: 10px;
          box-shadow: 0 26px 90px rgba(0,0,0,0.55);
          position: relative;
          margin: 0 auto;
          cursor: crosshair;
        }

        .pwFormInPageDownloadBtn {
          position: absolute;
          right: 12px;
          bottom: 12px;
          z-index: 60;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,0.14);
          background: rgba(15,23,42,0.06);
          color: rgba(15,23,42,0.90);
          padding: 10px 12px;
          font-weight: 950;
          cursor: pointer;
          user-select: none;
        }

        .pwFormInPageDownloadBtn:hover {
          background: rgba(15,23,42,0.09);
        }

        .pwFormInPageDownloadBtn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .pwFormHint {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          background: rgba(0,0,0,0.16);
          border-radius: 10px;
        }

        .pwFormHintPill {
          background: rgba(251,191,36,0.98);
          color: rgba(8,10,12,0.92);
          font-weight: 950;
          font-size: 12px;
          padding: 10px 14px;
          border-radius: 999px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.40);
          animation: xpdfPulse 900ms ease-in-out infinite;
        }

        @keyframes xpdfPulse {
          0% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.03); opacity: 1; }
          100% { transform: scale(1); opacity: 0.92; }
        }

        .pwField {
          position: absolute;
          border-radius: 8px;
          border: 2px solid rgba(59,130,246,0.35);
          background: rgba(255,255,255,0.82);
          box-shadow: 0 10px 24px rgba(0,0,0,0.10);
          backdrop-filter: blur(1px);
          user-select: none;
        }

        .pwFieldText {
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pwFieldMulti {
          padding: 10px 10px;
          display: grid;
          gap: 8px;
        }

        .pwFieldMultiLine {
          height: 9px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(15,23,42,0.14), rgba(15,23,42,0.06));
        }

        .pwFieldSelect {
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pwCaret {
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid rgba(15,23,42,0.45);
        }

        .pwRadioGroup {
          padding: 8px 10px;
          display: grid;
          gap: 10px;
        }

        .pwRadioRow {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 900;
          color: rgba(15,23,42,0.70);
        }

        .pwRadioDot {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid rgba(15,23,42,0.35);
          background: rgba(255,255,255,0.96);
          position: relative;
        }

        .pwRadioDot::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          background: rgba(15,23,42,0.55);
          opacity: 0.18;
        }

        .pwFieldTextLine {
          height: 10px;
          flex: 1;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(15,23,42,0.14), rgba(15,23,42,0.06));
        }

        .pwFieldCheckbox {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.92);
        }

        .pwCheckMark {
          width: 12px;
          height: 12px;
          border-right: 3px solid rgba(15,23,42,0.55);
          border-bottom: 3px solid rgba(15,23,42,0.55);
          transform: rotate(45deg);
          opacity: 0.25;
        }

        .pwFieldLabel {
          position: absolute;
          left: 6px;
          top: -18px;
          font-size: 10px;
          font-weight: 900;
          color: rgba(37, 99, 235, 0.95);
          background: rgba(255,255,255,0.95);
          padding: 2px 6px;
          border-radius: 999px;
          border: 1px solid rgba(37,99,235,0.18);
        }

        .pwFieldEditWidget {
          position: absolute;
          z-index: 90;
          width: 260px;
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,0.12);
          background: rgba(255,255,255,0.98);
          box-shadow: 0 22px 70px rgba(0,0,0,0.22);
          padding: 10px;
          backdrop-filter: blur(10px);
        }

        .pwFieldEditTitle {
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.2px;
          color: rgba(15,23,42,0.62);
          margin-bottom: 8px;
        }

        .pwFieldEditRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }

        .pwFieldEditInput {
          width: 100%;
          min-width: 0;
          border-radius: 12px;
          padding: 10px 10px;
          border: 1px solid rgba(15,23,42,0.14);
          background: rgba(15,23,42,0.04);
          color: rgba(15,23,42,0.92);
          font-weight: 950;
          outline: none;
          font-size: 13px;
        }

        .pwFieldEditInput:focus-visible {
          border-color: rgba(251,191,36,0.70);
          box-shadow: 0 0 0 4px rgba(251,191,36,0.20);
        }

        .pwFieldEditBtn {
          border-radius: 12px;
          padding: 10px 10px;
          border: 1px solid rgba(15,23,42,0.14);
          background: rgba(15,23,42,0.04);
          color: rgba(15,23,42,0.86);
          font-weight: 950;
          cursor: pointer;
          white-space: nowrap;
        }

        .pwFieldEditBtn:hover {
          background: rgba(15,23,42,0.07);
        }

        .pwFieldEditDanger {
          border-color: rgba(239,68,68,0.22);
          background: rgba(239,68,68,0.10);
          color: rgba(153,27,27,0.92);
        }

        .pwFieldEditDanger:hover {
          background: rgba(239,68,68,0.14);
        }

        .pwFieldEditHelp {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(15,23,42,0.58);
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .pwFieldEditMoveRow {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .pwFieldEditMoveRow .pwFieldEditBtn {
          padding: 10px 0;
          text-align: center;
          font-size: 14px;
          line-height: 1;
        }

        .pwFieldEditActions {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(15,23,42,0.10);
          display: flex;
          justify-content: flex-end;
        }

        .pwToolDock {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(18px);
        }

        .pwFieldProps {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(2,6,23,0.30);
          backdrop-filter: blur(18px);
        }

        .pwFieldInput {
          width: 100%;
          border-radius: 14px;
          padding: 12px 12px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          color: rgba(15,23,42,0.82);
          background: rgba(255,255,255,0.96);
          outline: none;
        }
          border: 1px solid rgba(15,23,42,0.10);
        .pwFieldInput:focus-visible {
          opacity: 0.82;
        }

        .pwToolBtnSmall:hover {
          opacity: 1;
          color: rgba(248,113,113,0.95);
        }
      `}</style>

      <div className="pwWrap">
        <div className="pwTop">
          <div>
            <div className="pwTitle">
              Set PDF Open Password
              <span className="pwBadge">Daily limit {dailyLimit}</span>
            </div>
            <div className="pwSub">
              Secure a PDF locally in your browser with an open-password.
              <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.62)' }}>
                Printing is limited, and editing/copying are disabled.
              </span>
            </div>
          </div>
          <div className="pwTopRight">
            <button type="button" onClick={() => navigate('/')} className="pill pill-neutral pillLink">
              Home
            </button>
            <button type="button" onClick={() => navigate('/editor')} className="pill pill-neutral pillLink">
              Editor
            </button>
            <button type="button" onClick={() => navigate('/features')} className="pill pill-warn pillLink">
              Go Pro
            </button>
            <AccountButton />
          </div>
        </div>

        <div className="pwCard">
          <div className="pwCardInner">
            <div className="pwSection">
              <div className="pwSectionTitle">
                <div className="pwKicker">1) Choose a PDF</div>
                {quota.kind === 'ok' ? (
                  <div className="pwBadge">Usage {quota.count}/{quota.limit}</div>
                ) : null}
              </div>

              <div className="pwRow">
                <button type="button" onClick={handlePickClick} disabled={processing} className="pwBtnPrimary">
                  Pick PDF
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.currentTarget.value = '';
                    setSelectedFile(f);
                    setError(null);
                    setNotice(null);
                  }}
                />

                <div className="pwMeta">
                  {selectedFile ? (
                    <span>
                      Selected: <span style={{ color: 'rgba(255,255,255,0.92)' }}>{selectedFile.name}</span>
                    </span>
                  ) : (
                    <span>No file chosen.</span>
                  )}
                </div>
              </div>

              {limitReached ? (
                <div className="pwCallout">
                  <div className="pwCalloutTitle">You have reached your daily limit</div>
                  <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.70)', fontSize: 13 }}>
                    Upgrade to Premium to remove limits.
                  </div>
                  <a href="/pricing" className="pwLink">
                    Upgrade to Premium
                  </a>
                </div>
              ) : null}

              {quota.kind === 'error' ? (
                <div style={{ marginTop: 10, color: 'rgba(248,113,113,0.95)', fontSize: 12 }}>{quota.message}</div>
              ) : null}

              <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 1.45 }}>
                If you’re not signed in, picking a file will redirect you to /login.
              </div>
            </div>

            <div className="pwSection">
              <div className="pwSectionTitle">
                <div className="pwKicker">2) Set password</div>
                <div className="pwBadge">AES-256</div>
              </div>

              <div className="pwRow">
                <input
                  className="pwInput"
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="Enter password"
                  disabled={processing}
                />

                <button
                  type="button"
                  onClick={handleEncrypt}
                  disabled={processing}
                  className="pwBtnPrimary"
                  style={{ minWidth: 170, display: 'inline-flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}
                >
                  {processing ? <span className="pwSpinner" aria-hidden="true" /> : null}
                  {processing ? 'Processing' : 'Encrypt PDF'}
                </button>
              </div>

              <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 1.45 }}>
                Tip: Save this password somewhere safe. If you forget it, the file may not be recoverable.
              </div>

              {error ? <div className="pwAlertError" style={{ marginTop: 14 }}>{error}</div> : null}
              {notice ? <div className="pwAlertNotice" style={{ marginTop: 14 }}>{notice}</div> : null}
            </div>
          </div>
        </div>

        {/* Resume / CV (Premium) */}
        <div className="pwCard">
          <div className="pwCardInner">
            <div className="pwSection pwResumeSection">
              <div className="pwResumeHeader">
                <div>
                  <div className="pwResumeTitle">
                    <Icon
                      path="M7 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h8V4H7zm2 3h4v2H9V7zm0 4h4v2H9v-2z"
                      size={18}
                    />
                    <span>Resume / CV</span>
                    <span className="pwBadge" style={{ margin: 0 }}>
                      Premium
                    </span>
                  </div>
                  <div className="pwResumeDesc">
                    Pick a polished template family to start your resume. Editor & exports are coming soon.
                  </div>
                </div>

                <button
                  type="button"
                  className="pill pill-neutral pillLink"
                  onClick={() => navigate('/features')}
                  aria-label="View Premium features"
                >
                  See Premium
                </button>
              </div>

              <div className="pwResumeGrid" role="group" aria-label="Resume templates">
                {RESUME_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="pwResumeTile"
                    onClick={() => navigate(`/resume?type=${encodeURIComponent(t.id)}`)}
                    aria-label={`Open ${t.title} resume templates`}
                  >
                    <span className="pwResumeTileIcon" aria-hidden="true">
                      {t.iconPath ? <Icon path={t.iconPath} size={18} /> : null}
                    </span>
                    <span>
                      <div className="pwResumeTileTitle">{t.title}</div>
                      <div className="pwResumeTileSub">{t.subtitle}</div>
                    </span>
                    <span className="pwResumeOpen">Open →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* PDF Form Builder */}
        <div className="pwFormCard">
          <div className="pwFormHeader">
            <div>
              <div className="pwFormTitle">
                <IFilePlus />
                <span>PDF Form Builder</span>
                <span className="pwBadge" style={{ borderColor: 'rgba(34,211,238,0.34)', color: 'rgba(226,232,240,0.85)' }}>
                  ADD FIELDS
                </span>
              </div>
              <div className="pwFormSub">
                Choose a tool, then click on the page to place a field. Download when you’re done.
              </div>
            </div>

            <div className="pwFormActions">
              <div className="pwDropdown">
                <button
                  ref={addFieldsBtnRef}
                  type="button"
                  className="pwDropdownBtn"
                  disabled={formProcessing}
                  onClick={() => setAddFieldsOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={addFieldsOpen}
                  title="Add fields"
                >
                  <span className="pwBadge" style={{ margin: 0, background: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.22)' }}>
                    Add fields
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>
                    {formPlacementMode === 'text'
                      ? 'Text'
                      : formPlacementMode === 'multiline'
                        ? 'Textarea'
                        : formPlacementMode === 'date'
                          ? 'Date'
                          : formPlacementMode === 'dropdown'
                            ? 'Dropdown'
                            : formPlacementMode === 'radio_yes_no'
                              ? 'Radio'
                              : formPlacementMode === 'checkbox'
                                ? 'Checkbox'
                                : 'Select'}
                  </span>
                  <span className="pwChevron" />
                </button>

                {addFieldsOpen ? (
                  <div ref={addFieldsMenuRef} className="pwDropdownMenu" role="menu" aria-label="Add fields">
                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('text');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <IType />
                      Text field
                      <span className="pwDropdownMeta">Type</span>
                    </button>

                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('multiline');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <IMultiline />
                      Multiline text
                      <span className="pwDropdownMeta">Textarea</span>
                    </button>

                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('date');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <ICalendar />
                      Date
                      <span className="pwDropdownMeta">YYYY-MM-DD</span>
                    </button>

                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('dropdown');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <IDropdown />
                      Dropdown
                      <span className="pwDropdownMeta">Select</span>
                    </button>

                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('radio_yes_no');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <IRadio />
                      Radio group
                      <span className="pwDropdownMeta">Yes / No</span>
                    </button>

                    <button
                      type="button"
                      className="pwDropdownItem"
                      role="menuitem"
                      onClick={() => {
                        setFormPlacementMode('checkbox');
                        setAddFieldsOpen(false);
                        setFormNotice(null);
                        setFormError(null);
                      }}
                      disabled={formProcessing}
                    >
                      <ICheck />
                      Checkbox
                      <span className="pwDropdownMeta">Bool</span>
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="pwDropdown">
                <button
                  ref={addButtonsBtnRef}
                  type="button"
                  className="pwDropdownBtn"
                  disabled
                  aria-haspopup="menu"
                  aria-expanded={false}
                  title="Add buttons (coming soon)"
                >
                  <span className="pwBadge" style={{ margin: 0, background: 'rgba(34,211,238,0.14)', borderColor: 'rgba(34,211,238,0.22)' }}>
                    Add buttons
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>
                    Coming soon
                  </span>
                  <span className="pwChevron" />
                </button>
              </div>

              {formPlacementMode ? (
                <button
                  type="button"
                  className="pwFormBtn"
                  disabled={formProcessing}
                  onClick={() => setFormPlacementMode(null)}
                  title="Cancel field placement"
                >
                  <IX />
                  Cancel
                </button>
              ) : null}

              <button
                type="button"
                className="pwFormBtn"
                disabled={formProcessing}
                onClick={() => formFileInputRef.current?.click()}
                title="Load an existing PDF (fields will be placed on page 1)"
              >
                <IFilePlus />
                Load PDF
              </button>

              <input
                ref={formFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.currentTarget.value = '';
                  if (!f) return;
                  void loadPdfIntoFormBuilder(f);
                }}
              />

              <button
                type="button"
                className="pwFormBtn"
                disabled={formProcessing}
                onClick={() => void resetFormDoc()}
                title="Start from a blank page"
              >
                <IX />
                Reset
              </button>

              <button
                type="button"
                className="pwFormBtn pwFormBtnPrimary"
                disabled={formProcessing}
                onClick={() => void downloadFormPdf()}
              >
                <ISave />
                Download
              </button>
            </div>
          </div>

          <div className="pwFormCanvasWrap">
            <div
              className="pwFormPage"
              onClick={(e) => {
                // If not placing a field, clicking the page should deselect the current field.
                if (!formPlacementMode) {
                  setSelectedFieldUid(null);
                  setSelectedFieldNameDraft('');
                  return;
                }
                if (formProcessing) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                void addFieldToPdf(x, y);
              }}
              role="application"
              aria-label="Form builder canvas"
            >
              {formFields.map((f) => (
                <div
                  key={f.uid}
                  className="pwField"
                  style={{
                    left: f.x,
                    top: f.y,
                    width: f.w,
                    height: f.h,
                    borderRadius: f.type === 'checkbox' ? 6 : 8,
                    borderColor: selectedFieldUid === f.uid ? 'rgba(251,191,36,0.85)' : 'rgba(59,130,246,0.45)',
                    background: selectedFieldUid === f.uid ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.85)',
                  }}
                  title={f.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFieldUid(f.uid);
                    setSelectedFieldNameDraft(f.name);
                    setFormError(null);
                  }}
                >
                  <div className="pwFieldLabel">{f.name}</div>
                  {f.type === 'text' || f.type === 'date' ? (
                    <div className="pwFieldText">
                      <div className="pwFieldTextLine" />
                      <div style={{ fontSize: 10, fontWeight: 950, color: 'rgba(15,23,42,0.55)' }}>Aa</div>
                    </div>
                  ) : f.type === 'multiline' ? (
                    <div className="pwFieldMulti">
                      <div className="pwFieldMultiLine" />
                      <div className="pwFieldMultiLine" style={{ width: '86%' }} />
                      <div className="pwFieldMultiLine" style={{ width: '72%' }} />
                    </div>
                  ) : f.type === 'dropdown' ? (
                    <div className="pwFieldSelect">
                      <div className="pwFieldTextLine" style={{ height: 9 }} />
                      <div className="pwCaret" />
                    </div>
                  ) : f.type === 'radio_yes_no' ? (
                    <div className="pwRadioGroup">
                      <div className="pwRadioRow">
                        <div className="pwRadioDot" />
                        Yes
                      </div>
                      <div className="pwRadioRow">
                        <div className="pwRadioDot" />
                        No
                      </div>
                    </div>
                  ) : (
                    <div className="pwFieldCheckbox">
                      <div className="pwCheckMark" />
                    </div>
                  )}
                </div>
              ))}

              {downloadActionEnabled ? (
                <button
                  type="button"
                  className="pwFormInPageDownloadBtn"
                  disabled={formProcessing}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void downloadFormJson();
                  }}
                  title="Download the JSON values of all fields"
                >
                  <IDownload />
                  Download JSON
                </button>
              ) : null}

              {selectedField ? (() => {
                const margin = 8;
                const widgetW = 260;
                const widgetApproxH = 138;
                const gap = 12;
                const rightLeft = selectedField.x + selectedField.w + gap;
                const leftLeft = selectedField.x - widgetW - gap;
                const maxLeft = FORM_W - widgetW - margin;
                const left = (rightLeft <= maxLeft)
                  ? rightLeft
                  : (leftLeft >= margin)
                    ? leftLeft
                    : clamp(rightLeft, margin, maxLeft);
                const top = clamp(selectedField.y, margin, FORM_H - widgetApproxH - margin);

                return (
                  <div
                    className="pwFieldEditWidget"
                    style={{ left, top, width: widgetW }}
                    onClick={(ev) => ev.stopPropagation()}
                    role="dialog"
                    aria-label="Edit selected field"
                  >
                    <div className="pwFieldEditTitle">Edit field</div>

                    <div className="pwFieldEditRow">
                      <input
                        ref={fieldEditNameInputRef}
                        className="pwFieldEditInput"
                        value={selectedFieldNameDraft}
                        onChange={(ev) => setSelectedFieldNameDraft(ev.target.value)}
                        placeholder="Field name (e.g. full_name)"
                        disabled={formProcessing}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            ev.preventDefault();
                            void renameSelectedField();
                          }
                          if (ev.key === 'Escape') {
                            ev.preventDefault();
                            setSelectedFieldUid(null);
                            setSelectedFieldNameDraft('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="pwFieldEditBtn"
                        onClick={() => void renameSelectedField()}
                        disabled={formProcessing}
                        title="Apply name"
                      >
                        Rename
                      </button>
                    </div>

                    <div className="pwFieldEditHelp">
                      <span>Selected: <b>{selectedField.name}</b></span>
                      <span>Esc to close</span>
                    </div>

                    <div className="pwFieldEditMoveRow" role="group" aria-label="Move field">
                      <button
                        type="button"
                        className="pwFieldEditBtn"
                        onClick={() => void moveSelectedField(0, -4)}
                        disabled={formProcessing}
                        title="Move up"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="pwFieldEditBtn"
                        onClick={() => void moveSelectedField(0, 4)}
                        disabled={formProcessing}
                        title="Move down"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="pwFieldEditBtn"
                        onClick={() => void moveSelectedField(-4, 0)}
                        disabled={formProcessing}
                        title="Move left"
                        aria-label="Move left"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="pwFieldEditBtn"
                        onClick={() => void moveSelectedField(4, 0)}
                        disabled={formProcessing}
                        title="Move right"
                        aria-label="Move right"
                      >
                        →
                      </button>
                    </div>

                    <div className="pwFieldEditActions">
                      <button
                        type="button"
                        className="pwFieldEditBtn pwFieldEditDanger"
                        onClick={() => void deleteSelectedField()}
                        disabled={formProcessing}
                        title="Delete field"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })() : null}

              {formPlacementMode ? (
                <div className="pwFormHint">
                  <div className="pwFormHintPill">
                    Click to place a{' '}
                    {formPlacementMode === 'text'
                      ? 'text'
                      : formPlacementMode === 'multiline'
                        ? 'multiline text'
                        : formPlacementMode === 'date'
                          ? 'date'
                          : formPlacementMode === 'dropdown'
                            ? 'dropdown'
                            : formPlacementMode === 'radio_yes_no'
                              ? 'radio group'
                              : 'checkbox'}
                    {' '}field
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {submitActionEnabled ? (
            <div className="pwFormActionBar" aria-label="Form actions">
              {submitActionEnabled ? (
                <div className="pwFormActionCard">
                  <div className="pwFormActionTitle">Submit</div>
                  <div className="pwFormActionSub">Sends the JSON to an email via your email client.</div>

                  <button
                    type="button"
                    className="pwFormBtn pwFormBtnPrimary"
                    disabled={formProcessing}
                    onClick={() => void submitFormJsonViaEmail()}
                  >
                    <ISend />
                    Submit JSON
                  </button>

                  <div className="pwFormEmailBox">
                    <div className="pwFormEmailLabel">Send to</div>
                    <div className="pwFormEmailRow">
                      <input
                        ref={submitEmailBottomInputRef}
                        className="pwFormEmailInput"
                        value={submitEmailDraft}
                        placeholder="name@domain.com"
                        onChange={(e) => setSubmitEmailDraft(e.target.value)}
                        disabled={formProcessing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveSubmitEmail();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="pwFormEmailSave"
                        onClick={() => saveSubmitEmail()}
                        disabled={formProcessing}
                        title="Save email"
                      >
                        Save
                      </button>
                    </div>
                    <div className="pwFormEmailHint">
                      Saved with this form (and in this browser). Used by Submit.
                      {submitEmailSaved ? ` Current: ${submitEmailSaved}` : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pwFormBtn"
                    disabled={formProcessing}
                    onClick={() => setSubmitActionEnabled(false)}
                    title="Remove submit action"
                    style={{ marginTop: 10 }}
                  >
                    <IX />
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {formError ? <div className="pwAlertError" style={{ marginTop: 12 }}>{formError}</div> : null}
          {formNotice ? <div className="pwAlertNotice" style={{ marginTop: 12 }}>{formNotice}</div> : null}

          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 1.45 }}>
            Note: Fields are added to page 1. For best compatibility, open the downloaded PDF in Acrobat/Chrome.
          </div>
        </div>

      </div>

      <button
        type="button"
        className="pwFeedbackFab"
        onClick={() => setIsFeedbackOpen(true)}
        aria-label="Give Feedback"
        title="Give Feedback"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M7.5 16.5 4 20V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16h-10Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M7.5 8.5h9M7.5 11.5h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <FeedbackOverlay isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  );
}
