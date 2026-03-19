import { PdfCanvas } from './components/PdfCanvas';
import { ToolPicker } from './components/ToolPicker';
import { useDocumentStore } from './state/documentStore';
import type { BorderStyle } from './state/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import OrbitLauncher from './components/OrbitLauncher';
import { useUiStore } from './state/uiStore';
import { useGoogleStore } from '../state/googleStore';
import { logFileOpened, setCurrentEditedFlag } from '../services/firebaseActivity';
import { mergePlusFilesToFile } from './util/mergePlus';
import { createId } from './util/ids';
import { appendBlankPage } from './pageops/insert';
import { useFileParser } from '../app/hooks/useFileParser';
import type { TextObj } from './state/types';
import type { ParserResult, ParserPage } from '../workers/fileProcessorTypes';

type BottomPopup = 'border' | 'background' | null;

function IconBorder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 4v16" opacity="0.35" />
      <path d="M4 8h16" opacity="0.35" />
    </svg>
  );
}

function IconBackground() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 16c1.2-2.4 3.2-5 4.5-6.3 1.2-1.2 2.6-1.2 3.8 0C17.8 11 19 13.4 20 16" opacity="0.45" />
      <path d="M8 16h12" opacity="0.45" />
    </svg>
  );
}

function BorderOptionIcon(props: {
  variant:
    | 'corporate'
    | 'modern-accent'
    | 'classic-frame'
    | 'ornate-corners'
    | 'floral-spectrum'
    | 'vintage-banner'
    | 'gold-frame'
    | 'doodle'
    | 'wave';
}) {
  if (props.variant === 'corporate') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="1.5" />
        <rect x="7.5" y="7.5" width="9" height="9" rx="1" opacity="0.55" />
      </svg>
    );
  }

  if (props.variant === 'modern-accent') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 10 V6 H10" />
        <path d="M14 6 H18 V10" />
        <path d="M6 14 V18 H10" />
        <path d="M14 18 H18 V14" />
      </svg>
    );
  }

  if (props.variant === 'classic-frame') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6H16L18 8V16L16 18H8L6 16V8L8 6Z" />
      </svg>
    );
  }

  if (props.variant === 'ornate-corners') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="1.5" opacity="0.65" />
        <path d="M7 10 C7 7 10 7 10 7" />
        <path d="M17 10 C17 7 14 7 14 7" />
        <path d="M7 14 C7 17 10 17 10 17" />
        <path d="M17 14 C17 17 14 17 14 17" />
      </svg>
    );
  }

  if (props.variant === 'floral-spectrum') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
        <path d="M8 8 q2 2 0 4 q-2 -2 0 -4Z" fill="currentColor" opacity="0.55" stroke="none" />
        <path d="M16 8 q2 2 0 4 q-2 -2 0 -4Z" fill="currentColor" opacity="0.55" stroke="none" />
      </svg>
    );
  }

  if (props.variant === 'vintage-banner') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="7" width="12" height="11" rx="1.5" opacity="0.65" />
        <path d="M8 9.5 Q12 7.2 16 9.5 Q12 11.8 8 9.5 Z" />
      </svg>
    );
  }

  if (props.variant === 'gold-frame') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
        <rect x="8" y="8" width="8" height="8" rx="1" opacity="0.55" />
      </svg>
    );
  }

  if (props.variant === 'doodle') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="1.5" strokeDasharray="3 2" />
        <path d="M8 9 l1 2 l2 1 l-2 1 l-1 2 l-1-2 l-2-1 l2-1 z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9 C9 7 15 11 18 9" />
      <path d="M6 15 C9 13 15 17 18 15" />
      <rect x="6" y="6" width="12" height="12" rx="1.5" opacity="0.35" />
    </svg>
  );
}

export function EditorPage() {
  const location = useLocation();
  const clearDoc = useDocumentStore((s) => s.clearDoc);
  const status = useDocumentStore((s) => s.status);
  const orbitLauncherOpen = useUiStore((s) => s.orbitLauncherOpen);
  const setOrbitLauncherOpen = useUiStore((s) => s.setOrbitLauncherOpen);
  const clearPageSelection = useUiStore((s) => s.clearPageSelection);
  const setTool = useUiStore((s) => s.setTool);
  const setSelectedImageId = useUiStore((s) => s.setSelectedImageId);
  const setSelectedTextId = useUiStore((s) => s.setSelectedTextId);

  const auth = useGoogleStore((s) => s.auth);
  const isDashboardOpen = useGoogleStore((s) => s.isDashboardOpen);
  const openDashboard = useGoogleStore((s) => s.openDashboard);
  const closeDashboard = useGoogleStore((s) => s.closeDashboard);
  const beginDriveConnectFromClick = useGoogleStore((s) => s.beginDriveConnectFromClick);

  const loadPdfFromFile = useDocumentStore((s) => s.loadPdfFromFile);
  const newDoc = useDocumentStore((s) => s.newDoc);
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const setDocTitle = useDocumentStore((s) => s.setDocTitle);

  const { parseFile } = useFileParser();

  const [launcherBusyId, setLauncherBusyId] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;
  const isVerboseDebug = (() => {
    if (!isDev) return false;
    try {
      return window.localStorage?.getItem('xpdf:debug:verbose') === '1';
    } catch {
      return false;
    }
  })();

  const pushDevEvent = (msg: string, extra?: unknown) => {
    if (!isDev) return;
    // Keep console clean by default; enable explicitly via localStorage.
    if (!isVerboseDebug) return;
    // eslint-disable-next-line no-console
    console.log(`[xpdf:debug] ${msg}`, extra ?? '');
  };

  const nowPerf = () => {
    try {
      return performance.now();
    } catch {
      return Date.now();
    }
  };

  useLayoutEffect(() => {
    if (!isDev) return;

    pushDevEvent('debug:mounted');

    const onPerf = (e: Event) => {
      const ce = e as CustomEvent<any>;
      const d = ce?.detail ?? null;
      const name = String(d?.name ?? '');
      const ms = d?.ms;
      if (!name) return;
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        pushDevEvent(`perf:${name}(ms)`, { ms: Math.round(ms), ...(d?.extra ?? {}) });
      } else {
        pushDevEvent(`perf:${name}`, d?.extra ?? null);
      }
    };
    window.addEventListener('xpdf:perf', onPerf as any);

    const describe = (t: EventTarget | null) => {
      const el = t as any;
      const tag = String(el?.tagName ?? '').toLowerCase() || 'unknown';
      const cls = typeof el?.className === 'string'
        ? el.className
        : (typeof el?.className?.baseVal === 'string' ? el.className.baseVal : '');
      const id = typeof el?.id === 'string' ? el.id : '';
      const out = [tag];
      if (id) out.push(`#${id}`);
      if (cls) out.push(`.${String(cls).trim().replace(/\s+/g, '.')}`);
      return out.join('');
    };

    const onDocPointerDown = (e: PointerEvent) => {
      pushDevEvent(`doc:pointerdown target=${describe(e.target)}`);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      window.removeEventListener('xpdf:perf', onPerf as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDev) return;
    if (!isVerboseDebug) return;
    pushDevEvent('store:status', status);
  }, [isDev, isVerboseDebug, status]);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const mergePlusInputRef = useRef<HTMLInputElement | null>(null);
  const imageMultiInputRef = useRef<HTMLInputElement | null>(null);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const dataInputRef = useRef<HTMLInputElement | null>(null);
  const markdownInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = (input: HTMLInputElement | null, label: string) => {
    if (!input) return;
    try {
      // Ensure selecting the same file twice still fires change.
      input.value = '';
    } catch {
      // ignore
    }
    pushDevEvent(`picker-open:${label}`, { accept: input.accept, multiple: input.multiple });

    try {
      const sp = (input as any).showPicker as undefined | (() => void);
      if (typeof sp === 'function') {
        sp.call(input);
        pushDevEvent(`picker-showPicker:${label}`);
      } else {
        input.click();
        pushDevEvent(`picker-click:${label}`);
      }
    } catch (err) {
      pushDevEvent(`picker-error:${label}`, err);
      try {
        input.click();
        pushDevEvent(`picker-click-fallback:${label}`);
      } catch (err2) {
        pushDevEvent(`picker-error-fallback:${label}`, err2);
      }
    }
  };

  const pickFiles = async (opts: {
    label: string;
    multiple?: boolean;
    // File System Access API accept structure
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<File[]> => {
    const multiple = !!opts.multiple;
    const w = window as any;

    if (typeof w?.showOpenFilePicker === 'function') {
      pushDevEvent(`fs-picker-open:${opts.label}`, { multiple, types: opts.types });
      try {
        const handles: any[] = await w.showOpenFilePicker({ multiple, types: opts.types });
        const files: File[] = [];
        for (const h of handles ?? []) {
          // eslint-disable-next-line no-await-in-loop
          const f = await h.getFile();
          files.push(f);
        }
        pushDevEvent(`fs-picker-picked:${opts.label}`, {
          count: files.length,
          first: files[0] ? { name: files[0].name, type: files[0].type, size: files[0].size } : null,
        });
        return files;
      } catch (err: any) {
        // AbortError means user cancelled
        pushDevEvent(`fs-picker-error:${opts.label}`, err);
        return [];
      }
    }

    pushDevEvent(`fs-picker-unavailable:${opts.label}`);
    return [];
  };

  const visuallyHiddenFileInputStyle = {
    position: 'fixed',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
    opacity: 0,
  } as const;

  useLayoutEffect(() => {
    const state = (location.state ?? null) as { preserveDoc?: boolean } | null;
    if (state?.preserveDoc) {
      setOrbitLauncherOpen(false);
      return;
    }

    // On dev/StrictMode or certain layout swaps, this component may remount.
    // Never wipe an already-loaded document (or one currently loading), otherwise PDF rendering
    // gets cancelled right after `docSet`.
    const current = useDocumentStore.getState();
    if (current.status?.loading) {
      setOrbitLauncherOpen(false);
      return;
    }
    if (current.doc?.basePdfBytes) {
      setOrbitLauncherOpen(false);
      return;
    }

    clearDoc();
    setOrbitLauncherOpen(true);
  }, [location.key, location.state, clearDoc, setOrbitLauncherOpen]);

  const doc = useDocumentStore((s) => s.doc);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const setActivePage = useDocumentStore((s) => s.setActivePage);
  const zoom = useDocumentStore((s) => s.zoom);
  const setPageBorder = useDocumentStore((s) => s.setPageBorder);
  const setPageBackground = useDocumentStore((s) => s.setPageBackground);

  useEffect(() => {
    // If a doc is loaded, the launcher should not obscure the editor.
    if (doc?.basePdfBytes) setOrbitLauncherOpen(false);
  }, [doc?.id, doc?.basePdfBytes, setOrbitLauncherOpen]);

  useEffect(() => {
    // Global, per-session edited flag used for Firebase activity logging.
    setCurrentEditedFlag(Boolean(isDirty));
  }, [isDirty]);

  const [bottomPopup, setBottomPopup] = useState<BottomPopup>(null);
  const isPopupOpen = bottomPopup !== null;
  const [applyBorderAll, setApplyBorderAll] = useState(false);
  const [applyBgAll, setApplyBgAll] = useState(false);

  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [bgDraftSrc, setBgDraftSrc] = useState<string | null>(null);
  const [bgDraftOpacity, setBgDraftOpacity] = useState(1);

  const currentBgObj = useMemo(() => {
    const objs = doc?.overlays[activePageIndex]?.objects ?? [];
    return objs.find((o) => (o as any).type === 'pageBackground') as any;
  }, [doc, activePageIndex]);

  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);

  const runMergePlus = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const outFile = await mergePlusFilesToFile({ files, outputBaseName: doc?.meta.title || 'document' });
      await loadPdfFromFile(outFile);
      void logFileOpened(outFile.name, 'local');
      clearPageSelection();
      setOrbitLauncherOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Merge+ failed');
    } finally {
      if (mergePlusInputRef.current) mergePlusInputRef.current.value = '';
    }
  };

  const runImportImagesToBlankDoc = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    try {
      await newDoc();
      const freshDoc = useDocumentStore.getState().doc;
      if (!freshDoc) return;

      const page0 = freshDoc.pageSizePoints?.[0]
        ? { w: freshDoc.pageSizePoints[0].widthPoints, h: freshDoc.pageSizePoints[0].heightPoints }
        : (freshDoc.pageSizes?.[0] ?? { w: 595, h: 842 });

      const readDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });

      const readDims = (dataUrl: string): Promise<{ w: number; h: number }> =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
          img.onerror = () => resolve({ w: 1, h: 1 });
          img.src = dataUrl;
        });

      const items = await Promise.all(
        images.map(async (file) => {
          const dataUrl = await readDataUrl(file);
          const dims = await readDims(dataUrl);
          return { file, dataUrl, dims };
        }),
      );

      const margin = 30;
      const gap = 12;
      const availW = Math.max(1, page0.w - margin * 2);
      const availH = Math.max(1, page0.h - margin * 2);
      const n = items.length;

      // Try to make cells roughly square in page space.
      const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * availW) / Math.max(1, availH)))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = (availW - gap * (cols - 1)) / cols;
      const cellH = (availH - gap * (rows - 1)) / rows;

      let firstId: string | null = null;

      items.forEach((it, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cellX = margin + col * (cellW + gap);
        const cellY = margin + row * (cellH + gap);

        const pad = Math.min(12, Math.max(6, Math.min(cellW, cellH) * 0.05));
        const maxW = Math.max(10, cellW - pad * 2);
        const maxH = Math.max(10, cellH - pad * 2);
        const scale = Math.min(maxW / Math.max(1, it.dims.w), maxH / Math.max(1, it.dims.h));
        const w = Math.max(10, it.dims.w * scale);
        const h = Math.max(10, it.dims.h * scale);
        const x = cellX + (cellW - w) / 2;
        const y = cellY + (cellH - h) / 2;

        const id = createId('img');
        if (!firstId) firstId = id;

        addOverlayObject(0, {
          id,
          type: 'image',
          src: it.dataUrl,
          name: it.file.name,
          mask: { type: 'none' },
          transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
          filters: {
            brightness: 1,
            contrast: 1,
            saturation: 1,
            grayscale: 0,
            sepia: 0,
            invert: 0,
          },
          opacity: 1,
          borderRadius: 0,
          rect: { x, y, w, h },
        } as any);
      });

      setTool('image');
      setSelectedImageId(firstId);
      useUiStore.setState((s) => ({ ...s, panels: { ...s.panels, propsOpen: true } }));
      clearPageSelection();
      setOrbitLauncherOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to import images');
    } finally {
      if (imageMultiInputRef.current) imageMultiInputRef.current.value = '';
    }
  };

  const htmlToPlainText = (html: string) => {
    try {
      const el = document.createElement('div');
      el.innerHTML = html;
      const text = (el.innerText || el.textContent || '').trim();
      return text;
    } catch {
      return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  };

  const pageToText = (page: ParserPage) => {
    if (page.kind === 'html') return htmlToPlainText(page.html);
    return JSON.stringify(page.json, null, 2);
  };

  const ensureBlankPages = async (targetPageCount: number) => {
    for (;;) {
      const s = useDocumentStore.getState();
      const d = s.doc;
      if (!d?.basePdfBytes) return;
      if (d.pageCount >= targetPageCount) return;

      const size = d.pageSizes?.[0] ?? { w: 595, h: 842 };
      // eslint-disable-next-line no-await-in-loop
      const res = await appendBlankPage({ basePdfBytes: d.basePdfBytes, size });

      useDocumentStore.setState((prev) => {
        if (!prev.doc) return prev;
        const insertAt = prev.doc.pageCount; // append

        const nextOrder = [...prev.doc.pageOrder, res.newOriginalIndex];
        const nextSizes = [...prev.doc.pageSizes, size];

        const prevPoints = prev.doc.pageSizePoints
          ? [...prev.doc.pageSizePoints]
          : prev.doc.pageSizes.map((ps) => ({
              widthPoints: ps.w,
              heightPoints: ps.h,
              sourceSizeType: 'inferred' as const,
              presetId: null,
            }));
        const nextPoints = [...prevPoints, {
          widthPoints: size.w,
          heightPoints: size.h,
          sourceSizeType: 'custom' as const,
          presetId: prev.doc.defaultPageSizePoints?.presetId ?? null,
        }];

        const nextRot = [...prev.doc.pageRotation, 0 as any];
        const nextCrop = prev.doc.pageCrop
          ? [...prev.doc.pageCrop, null]
          : [...Array.from({ length: prev.doc.pageCount }, () => null), null];

        return {
          ...prev,
          doc: {
            ...prev.doc,
            basePdfBytes: res.bytes,
            pageCount: prev.doc.pageCount + 1,
            pageOrder: nextOrder,
            pageSizes: nextSizes,
            pageSizePoints: nextPoints,
            pageRotation: nextRot,
            pageCrop: nextCrop,
          },
          isDirty: true,
          activePageIndex: insertAt,
        };
      });
    }
  };

  const applyParsedToNewDoc = async (result: ParserResult, title: string) => {
    await newDoc();
    setDocTitle(title);

    const pages = result.pages?.length ? result.pages : [];
    if (pages.length > 1) await ensureBlankPages(pages.length);

    const d = useDocumentStore.getState().doc;
    if (!d) return;
    const points = d.pageSizePoints?.length
      ? d.pageSizePoints.map((p) => ({ w: p.widthPoints, h: p.heightPoints }))
      : d.pageSizes;

    const imagesById = new Map<string, NonNullable<ParserResult['images']>[number]>();
    if (result.images?.length) {
      for (const im of result.images) imagesById.set(im.id, im);
    }

    const imagesByPage = new Map<number, typeof result.images>();
    const unplacedImages: NonNullable<ParserResult['images']> = [];
    if (result.images?.length) {
      for (const im of result.images) {
        const pos = (im as any).position as any;
        if (pos?.type === 'page' && typeof pos.pageIndex === 'number' && pos.pageIndex >= 0) {
          const arr = imagesByPage.get(pos.pageIndex) ?? [];
          arr.push(im);
          imagesByPage.set(pos.pageIndex, arr);
        } else {
          unplacedImages.push(im);
        }
      }
    }

    let firstTextId: string | null = null;
    pages.forEach((p, pageIndex) => {
      const ps = points?.[pageIndex] ?? points?.[0] ?? { w: 595, h: 842 };

      const isPrePage = p.kind === 'html' && /<pre\b/i.test(p.html);

      // EPUB inline image markers: <p data-epub-img="..."> placeholders.
      const hasEpubMarkers = p.kind === 'html' && /data-epub-img\s*=/.test(p.html);
      if (hasEpubMarkers && p.kind === 'html') {
        const margin = 40;
        const gap = 12;
        const colW = Math.max(1, ps.w - margin * 2);
        let cursorY = margin;

        const container = document.createElement('div');
        container.innerHTML = p.html;
        const root = container.firstElementChild ?? container;
        const blocks = Array.from(root.children) as HTMLElement[];

        const addTextBlock = (text: string) => {
          const t = (text || '').trim();
          if (!t) return;

          const fontSize = 12;
          const lineHeight = 1.25;

          // Very rough height estimate to keep blocks readable.
          const approxCharsPerLine = Math.max(20, Math.floor(colW / (fontSize * 0.6)));
          const approxLines = Math.max(1, Math.ceil(t.length / approxCharsPerLine));
          const h = Math.min(ps.h - margin - cursorY, approxLines * fontSize * lineHeight + 16);
          if (h <= 0) return;

          const id = createId('txt');
          if (!firstTextId) firstTextId = id;
          const obj: TextObj = {
            id,
            type: 'text',
            text: t,
            color: '#111111',
            fontSize,
            font: { family: 'Helvetica', size: fontSize, bold: false, italic: false },
            strike: false,
            align: 'left',
            lineHeight,
            rect: { x: margin, y: cursorY, w: colW, h: Math.max(40, h) },
          };
          addOverlayObject(pageIndex, obj as any);
          cursorY += Math.max(40, h) + gap;
        };

        const addImageBlock = (im: NonNullable<ParserResult['images']>[number]) => {
          const tileW = colW;
          const tileH = Math.min(220, Math.max(120, ps.h * 0.26));
          if (cursorY + tileH > ps.h - margin) return;
          const id2 = createId('img');
          addOverlayObject(pageIndex, {
            id: id2,
            type: 'image',
            src: `data:${im.contentType};base64,${im.base64}`,
            name: im.id,
            mask: { type: 'none' },
            transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
            filters: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, invert: 0 },
            opacity: 1,
            borderRadius: 0,
            rect: { x: margin, y: cursorY, w: tileW, h: tileH },
          } as any);
          cursorY += tileH + gap;
        };

        for (const el of blocks) {
          const imgId = (el as any)?.dataset?.epubImg as string | undefined;
          if (imgId) {
            const im = imagesById.get(imgId);
            if (im) addImageBlock(im);
            else addTextBlock('[image]');
            continue;
          }

          // Use the same HTML->text conversion helper for consistency.
          addTextBlock(htmlToPlainText(el.outerHTML));
        }

        return;
      }

      // Default: one text block + optional right-column images (page-hinted).
      const text = pageToText(p);
      const id = createId('txt');
      if (!firstTextId) firstTextId = id;

      const pageImages = imagesByPage.get(pageIndex) ?? [];
      const maxPerPage = 3;
      const placeHere = pageImages.slice(0, maxPerPage);
      if (pageImages.length > maxPerPage) {
        unplacedImages.push(...pageImages.slice(maxPerPage));
      }

      const margin = 40;
      const gap = 12;
      const colW = placeHere.length ? Math.min(200, Math.max(140, ps.w * 0.28)) : 0;
      const textRectW = Math.max(120, ps.w - margin * 2 - (colW ? colW + gap : 0));

      const obj: TextObj = {
        id,
        type: 'text',
        text,
        color: '#111111',
        fontSize: isPrePage ? 10.5 : 12,
        font: { family: isPrePage ? 'Courier' : 'Helvetica', size: isPrePage ? 10.5 : 12, bold: false, italic: false },
        strike: false,
        align: 'left',
        lineHeight: isPrePage ? 1.15 : 1.25,
        rect: { x: margin, y: margin, w: textRectW, h: Math.max(120, ps.h - margin * 2) },
      };
      addOverlayObject(pageIndex, obj as any);

      if (placeHere.length) {
        const tileW = colW;
        const tileH = Math.min(160, Math.max(90, (ps.h - margin * 2 - gap * (placeHere.length - 1)) / placeHere.length));
        const x = ps.w - margin - tileW;
        placeHere.forEach((im, i) => {
          const y = margin + i * (tileH + gap);
          const id2 = createId('img');
          addOverlayObject(pageIndex, {
            id: id2,
            type: 'image',
            src: `data:${im.contentType};base64,${im.base64}`,
            name: im.id,
            mask: { type: 'none' },
            transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
            filters: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, invert: 0 },
            opacity: 1,
            borderRadius: 0,
            rect: { x, y, w: tileW, h: tileH },
          } as any);
        });
      }
    });

    // Fallback: any remaining images (including non-page-hinted) go into a grid on the last page.
    if (unplacedImages.length) {
      const targetPageIndex = Math.max(0, (pages.length || 1) - 1);
      const ps = points?.[targetPageIndex] ?? points?.[0] ?? { w: 595, h: 842 };
      const margin = 40;
      const gap = 10;
      const cols = 2;
      const tileW = (ps.w - margin * 2 - gap * (cols - 1)) / cols;
      const tileH = Math.min(180, (ps.h - margin * 2) / 3);
      unplacedImages.slice(0, 6).forEach((im, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * (tileW + gap);
        const y = ps.h - margin - (row + 1) * tileH - row * gap;
        const id = createId('img');
        addOverlayObject(targetPageIndex, {
          id,
          type: 'image',
          src: `data:${im.contentType};base64,${im.base64}`,
          name: im.id,
          mask: { type: 'none' },
          transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
          filters: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, invert: 0 },
          opacity: 1,
          borderRadius: 0,
          rect: { x, y, w: tileW, h: tileH },
        } as any);
      });
    }

    setTool('text');
    if (firstTextId) setSelectedTextId(firstTextId);
    useUiStore.setState((s) => ({ ...s, panels: { ...s.panels, propsOpen: true } }));
    clearPageSelection();
    setOrbitLauncherOpen(false);
  };

  const onLauncherSelect = (id: string) => {
    pushDevEvent(`launcher-select:${id}`);
    if (id === 'pdf') {
      void (async () => {
        setLauncherBusyId('pdf');
        // Close immediately (before opening the native picker) so the overlay doesn't stick around
        // while the browser file dialog is open.
        setOrbitLauncherOpen(false);
        try {
          const t0 = nowPerf();
          const files = await pickFiles({
            label: 'pdf',
            multiple: false,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
          });
          const tPick = nowPerf();
          if (import.meta.env.DEV) {
            pushDevEvent('perf:picker(ms)', Math.round(tPick - t0));
          }
          const file = files[0];
          if (file) {
            // Close immediately so the overlay can't obscure the editor during async load.
            pushDevEvent('loadPdfFromFile:start', { name: file.name, type: file.type, size: file.size });
            const tLoad0 = nowPerf();
            await loadPdfFromFile(file);
            void logFileOpened(file.name, 'local');
            pushDevEvent('loadPdfFromFile:done');
            const tLoad1 = nowPerf();
            if (import.meta.env.DEV) {
              pushDevEvent('perf:loadPdfFromFile(ms)', Math.round(tLoad1 - tLoad0));
            }
            return;
          }

          // User cancelled the FS picker: reopen the launcher so it doesn't look like a dead-end.
          setOrbitLauncherOpen(true);
          // Fallback to input picker if FS picker unavailable/cancelled
          openFilePicker(pdfInputRef.current, 'pdf');
        } catch (err) {
          pushDevEvent('loadPdfFromFile:error', err);
          alert(err instanceof Error ? err.message : 'Failed to load PDF');
          // Restore launcher on error.
          setOrbitLauncherOpen(true);
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'img') {
      void (async () => {
        setLauncherBusyId('img');
        try {
          const files = await pickFiles({
            label: 'img',
            multiple: true,
            types: [
              {
                description: 'Images',
                accept: {
                  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.svg'],
                },
              },
            ],
          });
          if (files.length) {
            await runImportImagesToBlankDoc(files);
            return;
          }
          openFilePicker(imageMultiInputRef.current, 'img');
        } catch (err) {
          pushDevEvent('importImages:error', err);
          alert(err instanceof Error ? err.message : 'Failed to import images');
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'docx') {
      void (async () => {
        setLauncherBusyId('docx');
        try {
          const files = await pickFiles({
            label: 'docs',
            multiple: false,
            types: [
              {
                description: 'Documents',
                accept: {
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                  'application/msword': ['.doc'],
                  'application/vnd.oasis.opendocument.text': ['.odt'],
                  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
                },
              },
            ],
          });
          const file = files[0];
          if (file) {
            const res = await parseFile(file);
            await applyParsedToNewDoc(res, file.name);
            void logFileOpened(file.name, 'local');
            return;
          }
          openFilePicker(docsInputRef.current, 'docs');
        } catch (err) {
          pushDevEvent('parseFile:error', err);
          alert(err instanceof Error ? err.message : 'Failed to parse file');
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'txt') {
      void (async () => {
        setLauncherBusyId('txt');
        try {
          const files = await pickFiles({
            label: 'data',
            multiple: false,
            types: [
              {
                description: 'Data',
                accept: {
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                  'application/vnd.ms-excel': ['.xls'],
                  'text/csv': ['.csv'],
                  'application/epub+zip': ['.epub'],
                  'text/plain': ['.txt'],
                },
              },
            ],
          });
          const file = files[0];
          if (file) {
            const res = await parseFile(file);
            await applyParsedToNewDoc(res, file.name);
            void logFileOpened(file.name, 'local');
            return;
          }
          openFilePicker(dataInputRef.current, 'data');
        } catch (err) {
          pushDevEvent('parseFile:error', err);
          alert(err instanceof Error ? err.message : 'Failed to parse file');
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'drive') {
      void (async () => {
        setLauncherBusyId('drive');
        try {
          const files = await pickFiles({
            label: 'markdown',
            multiple: false,
            types: [
              {
                description: 'Markdown/Text',
                accept: {
                  'text/markdown': ['.md'],
                  'text/plain': ['.txt'],
                },
              },
            ],
          });
          const file = files[0];
          if (file) {
            const res = await parseFile(file);
            await applyParsedToNewDoc(res, file.name);
            void logFileOpened(file.name, 'local');
            return;
          }
          openFilePicker(markdownInputRef.current, 'markdown');
        } catch (err) {
          pushDevEvent('parseFile:error', err);
          alert(err instanceof Error ? err.message : 'Failed to parse file');
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'merge') {
      void (async () => {
        setLauncherBusyId('merge');
        try {
          const files = await pickFiles({
            label: 'merge',
            multiple: true,
            types: [{ description: 'PDFs', accept: { 'application/pdf': ['.pdf'] } }],
          });
          if (files.length) {
            await runMergePlus(files);
            return;
          }
          openFilePicker(mergePlusInputRef.current, 'merge');
        } catch (err) {
          pushDevEvent('merge:error', err);
          alert(err instanceof Error ? err.message : 'Merge+ failed');
        } finally {
          setLauncherBusyId(null);
        }
      })();
      return;
    }

    if (id === 'new') {
      void (async () => {
        await newDoc();
        setOrbitLauncherOpen(false);
      })();
      return;
    }

    if (id === 'gdrive') {
      // Match the existing Drive behavior in EditorLayout/MobileEditor:
      // - If signed in: toggle dashboard
      // - If not: trigger Google sign-in (incl. Drive scopes) then open dashboard
      setOrbitLauncherOpen(false);

      if (auth?.isSignedIn) {
        if (isDashboardOpen) closeDashboard();
        else openDashboard();
        return;
      }

      // Open immediately so the user sees loading/errors.
      openDashboard();

      setLauncherBusyId('gdrive');
      beginDriveConnectFromClick();
      // If we didn't redirect away, clear the busy state shortly.
      window.setTimeout(() => setLauncherBusyId(null), 1200);

      return;
    }

    alert('Coming soon');
  };

  if (!doc) {
    return (
      <div className="editorRoot">
        <div className="editorCanvasWrap" style={{ position: 'relative' }}>

          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            style={visuallyHiddenFileInputStyle}
            onClick={() => {
              pushDevEvent('input-click:pdf');
            }}
            onInput={() => {
              pushDevEvent('input-input:pdf');
            }}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              // Reset immediately so re-selecting the same file still triggers change.
              input.value = '';
              if (!file) return;
              pushDevEvent('input-change:pdf', { name: file.name, type: file.type, size: file.size });
              setLauncherBusyId('pdf');
              try {
                await loadPdfFromFile(file);
                void logFileOpened(file.name, 'local');
                pushDevEvent('loadPdfFromFile:done');
                setOrbitLauncherOpen(false);
              } catch (err) {
                pushDevEvent('loadPdfFromFile:error', err);
                alert(err instanceof Error ? err.message : 'Failed to load PDF');
              } finally {
                setLauncherBusyId(null);
              }
            }}
          />

          <input
            ref={mergePlusInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={visuallyHiddenFileInputStyle}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).filter((f) => f.type === 'application/pdf');
              try {
                e.currentTarget.value = '';
              } catch {
                // ignore
              }
              pushDevEvent('input-change:merge', { count: files.length });
              void runMergePlus(files);
            }}
          />

          <input
            ref={imageMultiInputRef}
            type="file"
            accept="image/*"
            multiple
            style={visuallyHiddenFileInputStyle}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
              try {
                e.currentTarget.value = '';
              } catch {
                // ignore
              }
              pushDevEvent('input-change:img', {
                count: files.length,
                first: files[0] ? { name: files[0].name, type: files[0].type, size: files[0].size } : null,
              });
              void runImportImagesToBlankDoc(files);
            }}
          />

          <input
            ref={docsInputRef}
            type="file"
            accept=".docx,.odt,.doc,.ods,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={visuallyHiddenFileInputStyle}
            onClick={() => {
              pushDevEvent('input-click:docs');
            }}
            onInput={() => {
              pushDevEvent('input-input:docs');
            }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              pushDevEvent('input-change:docs', { name: file.name, type: file.type, size: file.size });
              void (async () => {
                setLauncherBusyId('docx');
                try {
                  const res = await parseFile(file);
                  await applyParsedToNewDoc(res, file.name);
                  void logFileOpened(file.name, 'local');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to parse file');
                } finally {
                  setLauncherBusyId(null);
                }
              })();
            }}
          />

          <input
            ref={dataInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.epub,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/epub+zip"
            style={visuallyHiddenFileInputStyle}
            onClick={() => {
              pushDevEvent('input-click:data');
            }}
            onInput={() => {
              pushDevEvent('input-input:data');
            }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              pushDevEvent('input-change:data', { name: file.name, type: file.type, size: file.size });
              void (async () => {
                setLauncherBusyId('txt');
                try {
                  const res = await parseFile(file);
                  await applyParsedToNewDoc(res, file.name);
                  void logFileOpened(file.name, 'local');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to parse file');
                } finally {
                  setLauncherBusyId(null);
                }
              })();
            }}
          />

          <input
            ref={markdownInputRef}
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            style={visuallyHiddenFileInputStyle}
            onClick={() => {
              pushDevEvent('input-click:markdown');
            }}
            onInput={() => {
              pushDevEvent('input-input:markdown');
            }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              pushDevEvent('input-change:markdown', { name: file.name, type: file.type, size: file.size });
              void (async () => {
                setLauncherBusyId('drive');
                try {
                  const res = await parseFile(file);
                  await applyParsedToNewDoc(res, file.name);
                  void logFileOpened(file.name, 'local');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to parse file');
                } finally {
                  setLauncherBusyId(null);
                }
              })();
            }}
          />

          <OrbitLauncher
            open={orbitLauncherOpen}
            onClose={() => setOrbitLauncherOpen(false)}
            onSelect={onLauncherSelect}
            busyOptionId={launcherBusyId as any}
            onDebugEvent={(msg) => {
              pushDevEvent(msg);
            }}
          />
        </div>
      </div>
    );
  }

  const applyBorder = (style: BorderStyle | null) => {
    if (applyBorderAll) {
      for (let i = 0; i < doc.pageCount; i++) {
        setPageBorder(i, style ? { style } : null);
      }
      return;
    }
    setPageBorder(activePageIndex, style ? { style } : null);
  };

  const applyBackgroundNone = () => {
    setBgDraftSrc(null);
    setBgDraftOpacity(1);
    if (!doc) return;
    if (applyBgAll) {
      for (let i = 0; i < doc.pageCount; i++) setPageBackground(i, null);
      return;
    }
    setPageBackground(activePageIndex, null);
  };

  const applyBackgroundOk = () => {
    if (!doc) return;
    if (!bgDraftSrc) return;
    const payload = { src: bgDraftSrc, opacity: bgDraftOpacity };
    if (applyBgAll) {
      for (let i = 0; i < doc.pageCount; i++) setPageBackground(i, payload as any);
      return;
    }
    setPageBackground(activePageIndex, payload as any);
  };

  return (
    <div className="editorRoot">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        style={visuallyHiddenFileInputStyle}
        onClick={() => {
          pushDevEvent('input-click:pdf');
        }}
        onInput={() => {
          pushDevEvent('input-input:pdf');
        }}
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (!file) return;
          pushDevEvent('input-change:pdf', { name: file.name, type: file.type, size: file.size });
          setLauncherBusyId('pdf');
          try {
            await loadPdfFromFile(file);
            void logFileOpened(file.name, 'local');
            pushDevEvent('loadPdfFromFile:done');
            setOrbitLauncherOpen(false);
          } catch (err) {
            pushDevEvent('loadPdfFromFile:error', err);
            alert(err instanceof Error ? err.message : 'Failed to load PDF');
          } finally {
            setLauncherBusyId(null);
          }
        }}
      />

      <input
        ref={mergePlusInputRef}
        type="file"
        accept="application/pdf"
        multiple
        style={visuallyHiddenFileInputStyle}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => f.type === 'application/pdf');
          try {
            e.currentTarget.value = '';
          } catch {
            // ignore
          }
          pushDevEvent('input-change:merge', { count: files.length });
          void runMergePlus(files);
        }}
      />

      <input
        ref={imageMultiInputRef}
        type="file"
        accept="image/*"
        multiple
        style={visuallyHiddenFileInputStyle}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
          try {
            e.currentTarget.value = '';
          } catch {
            // ignore
          }
          pushDevEvent('input-change:img', {
            count: files.length,
            first: files[0] ? { name: files[0].name, type: files[0].type, size: files[0].size } : null,
          });
          void runImportImagesToBlankDoc(files);
        }}
      />

      <input
        ref={docsInputRef}
        type="file"
        accept=".docx,.odt,.doc,.ods,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={visuallyHiddenFileInputStyle}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          pushDevEvent('input-change:docs', { name: file.name, type: file.type, size: file.size });
          void (async () => {
            setLauncherBusyId('docx');
            try {
              const res = await parseFile(file);
              await applyParsedToNewDoc(res, file.name);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to parse file');
            } finally {
              setLauncherBusyId(null);
            }
          })();
        }}
      />

      <input
        ref={dataInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.epub,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/epub+zip"
        style={visuallyHiddenFileInputStyle}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          pushDevEvent('input-change:data', { name: file.name, type: file.type, size: file.size });
          void (async () => {
            setLauncherBusyId('txt');
            try {
              const res = await parseFile(file);
              await applyParsedToNewDoc(res, file.name);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to parse file');
            } finally {
              setLauncherBusyId(null);
            }
          })();
        }}
      />

      <input
        ref={markdownInputRef}
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          void (async () => {
            setLauncherBusyId('drive');
            try {
              const res = await parseFile(file);
              await applyParsedToNewDoc(res, file.name);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to parse file');
            } finally {
              setLauncherBusyId(null);
            }
          })();
        }}
      />

      <OrbitLauncher
        open={orbitLauncherOpen}
        onClose={() => setOrbitLauncherOpen(false)}
        onSelect={onLauncherSelect}
        busyOptionId={launcherBusyId as any}
        onDebugEvent={(msg) => {
          pushDevEvent(msg);
        }}
      />
      <div className="editorToolbar">
        <ToolPicker />
        <div className="toolbarSpacer" />
        <button className="button-38" type="button" onClick={undo}>Undo</button>
        <button className="button-38" type="button" onClick={redo}>Redo</button>
        <div style={{ width: 10 }} />
        <button
          className="button-38"
          type="button"
          onClick={() => {
            // Phase 1: minimal zoom controls.
            useDocumentStore.setState({ zoom: Math.max(0.25, zoom - 0.1) });
          }}
        >
          -
        </button>
        <span className="muted" style={{ minWidth: 50, textAlign: 'center' }}>
          {(zoom * 100).toFixed(0)}%
        </span>
        <button
          className="button-38"
          type="button"
          onClick={() => {
            useDocumentStore.setState({ zoom: Math.min(3, zoom + 0.1) });
          }}
        >
          +
        </button>
        <div style={{ width: 10 }} />
        <button className="button-38" type="button" onClick={() => setActivePage(activePageIndex - 1)}>
          Prev
        </button>
        <button className="button-38" type="button" onClick={() => setActivePage(activePageIndex + 1)}>
          Next
        </button>
      </div>

      <div className="editorCanvasWrap">
        <PdfCanvas />
      </div>

      <div className="pageToolsFloating" aria-label="Page tools">
        <button
          type="button"
          className={bottomPopup === 'border' ? 'pageToolsBtn active' : 'pageToolsBtn'}
          aria-pressed={bottomPopup === 'border'}
          title="Page border"
          onClick={() => setBottomPopup((v) => (v === 'border' ? null : 'border'))}
        >
          <IconBorder />
        </button>

        <button
          type="button"
          aria-pressed={bottomPopup === 'background'}
          title="Page background"
          onClick={() => setBottomPopup((v) => (v === 'background' ? null : 'background'))}
        >
          <IconBackground />
        </button>
      </div>

      <div
        className={isPopupOpen ? 'pageToolsPopup open' : 'pageToolsPopup'}
        style={{
          ['--pageToolsPopupOriginX' as any]: bottomPopup === 'background' ? '62px' : '18px',
          ['--pageToolsPopupOriginY' as any]: 'calc(100% + 26px)',
        }}
        role={isPopupOpen ? 'dialog' : undefined}
        aria-hidden={!isPopupOpen}
        aria-label={
          bottomPopup === 'border' ? 'Border tools'
            : bottomPopup === 'background' ? 'Background tools'
              : 'Page tools'
        }
      >
        <div className="pageToolsPopupHeader">
          <div className="pageToolsHeaderLeft">
            <div className="muted">
              {bottomPopup === 'border' ? 'Border' : bottomPopup === 'background' ? 'Background' : ''}
            </div>

            {bottomPopup === 'border' ? (
              <div className="pageToolsHeaderActions">
                <button
                  type="button"
                  className="pageToolsHeaderBtn"
                  onClick={() => applyBorder(null)}
                >
                  None
                </button>

                <div className="row" style={{ gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Apply to All</span>
                  <label className="studioToggle" style={{ alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={applyBorderAll}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setApplyBorderAll(checked);

                        // If enabling, immediately apply the current page's border to all pages.
                        if (checked) {
                          const current = doc.overlays[activePageIndex]?.objects?.find((o) => (o as any).type === 'pageBorder') as any;
                          if (current?.style) {
                            for (let i = 0; i < doc.pageCount; i++) {
                              setPageBorder(i, {
                                style: current.style,
                                color: current.color,
                                strokeWidth: current.strokeWidth,
                              });
                            }
                          }
                        }
                      }}
                      aria-label="Apply border to all pages"
                    />
                    <span className="studioToggleTrack" aria-hidden="true">
                      <span className="studioToggleThumb" />
                    </span>
                  </label>
                </div>
              </div>
            ) : bottomPopup === 'background' ? (
              <div className="pageToolsHeaderActions">
                <button
                  type="button"
                  className="pageToolsHeaderBtn"
                  onClick={applyBackgroundNone}
                >
                  None
                </button>

                <div className="row" style={{ gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Apply to All</span>
                  <label className="studioToggle" style={{ alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={applyBgAll}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setApplyBgAll(checked);

                        // If enabling, immediately apply the current page's background to all pages.
                        if (checked && doc) {
                          const cur = currentBgObj;
                          if (cur?.src) {
                            for (let i = 0; i < doc.pageCount; i++) {
                              setPageBackground(i, { src: cur.src, opacity: cur.opacity } as any);
                            }
                          }
                        }
                      }}
                      aria-label="Apply background to all pages"
                    />
                    <span className="studioToggleTrack" aria-hidden="true">
                      <span className="studioToggleThumb" />
                    </span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="pageToolsDots" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>

        {bottomPopup === 'border' ? (
          <div className="pageToolsPopupContent">
            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('corporate')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="corporate" /></span>
              <span className="pageToolsOptionLabel">Corporate</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('modern-accent')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="modern-accent" /></span>
              <span className="pageToolsOptionLabel">Modern accent</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('classic-frame')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="classic-frame" /></span>
              <span className="pageToolsOptionLabel">Classic frame</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('ornate-corners')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="ornate-corners" /></span>
              <span className="pageToolsOptionLabel">Ornate corners</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('floral-spectrum')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="floral-spectrum" /></span>
              <span className="pageToolsOptionLabel">Floral spectrum</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('vintage-banner')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="vintage-banner" /></span>
              <span className="pageToolsOptionLabel">Vintage banner</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('gold-frame')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="gold-frame" /></span>
              <span className="pageToolsOptionLabel">Gold frame</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('doodle')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="doodle" /></span>
              <span className="pageToolsOptionLabel">Doodle</span>
            </button>

            <button
              type="button"
              className="pageToolsOption"
              onClick={() => applyBorder('wave')}
            >
              <span className="pageToolsOptionIcon"><BorderOptionIcon variant="wave" /></span>
              <span className="pageToolsOptionLabel">Wave</span>
            </button>
          </div>
        ) : null}

        {bottomPopup === 'background' ? (
          <div className="pageBgPopupContent">
            <div className="pageBgRow">
              <button
                type="button"
                className="pageToolsHeaderBtn"
                onClick={() => bgFileInputRef.current?.click()}
              >
                Choose image
              </button>

              <button
                type="button"
                className="pageToolsHeaderBtn"
                onClick={applyBackgroundOk}
                disabled={!bgDraftSrc}
              >
                OK
              </button>

              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Only images.
                  if (!file.type.startsWith('image/')) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const res = reader.result;
                    if (typeof res === 'string') {
                      setBgDraftSrc(res);
                      // Keep current opacity setting.
                    }
                  };
                  reader.readAsDataURL(file);

                  // Allow selecting the same file again.
                  try {
                    e.currentTarget.value = '';
                  } catch {
                    // ignore
                  }
                }}
              />
            </div>

            <div className="pageBgPreviewWrap">
              <div className="pageBgPreview" aria-label="Background preview">
                {bgDraftSrc ? (
                  <img src={bgDraftSrc} alt="" style={{ opacity: bgDraftOpacity }} />
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>No image selected</div>
                )}
              </div>

              <div className="pageBgSide">
                <div>
                  <div className="pageBgSliderLabel">Opacity</div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(bgDraftOpacity * 100)}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setBgDraftOpacity(v / 100);
                    }}
                  />
                  <div className="muted" style={{ fontSize: 12 }}>{Math.round(bgDraftOpacity * 100)}%</div>
                </div>

                <div className="muted" style={{ fontSize: 12 }}>
                  Preview only until OK
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pageIndicatorFloating" aria-label="Current page">
        {activePageIndex + 1} / {doc.pageCount}
      </div>
    </div>
  );
}
