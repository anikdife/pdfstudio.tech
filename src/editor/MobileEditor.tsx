import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PdfCanvas } from './components/PdfCanvas';
import OrbitLauncher from './components/OrbitLauncher';
import { useDocumentStore } from './state/documentStore';
import { useUiStore } from './state/uiStore';
import { useGoogleStore } from '../state/googleStore';
import { useFirebaseUserStore } from '../state/firebaseUserStore';
import { DriveDashboard } from '../components/cloud/DriveDashboard';
import { useFileParser } from '../app/hooks/useFileParser';
import { appendBlankPage } from './pageops/insert';
import { createId } from './util/ids';
import type { ParserPage, ParserResult } from '../workers/fileProcessorTypes';
import type { TextObj } from './state/types';
import { exportPagesFromModel } from './pageops/extract';
import { downloadBytes } from './util/file';
import { getPdfDocument } from './pdf/render';
import { clearEditorThumbnailCache, getEditorThumbnailDataUrlCached } from './pdf/thumbnails';
import { getPropertyGroupsForFeature, MOBILE_FEATURES, type MobileFeatureId, type MobilePropertyGroupId } from './mobile/mobileFeatureDefs';
import { logFileExported, logFileOpened, setCurrentEditedFlag } from '../services/firebaseActivity';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Icon(props: { children: React.ReactNode; size?: number }) {
  const size = props.size ?? 22;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

function IconClose(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icon>
  );
}

function IconInfo(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M12 8h.01" />
      <path d="M11 12h1v6h1" />
      <circle cx="12" cy="12" r="9" />
    </Icon>
  );
}

function IconFolder(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </Icon>
  );
}

function IconDots(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
    </Icon>
  );
}

function IconGrid(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M4 4h7v7H4V4z" />
      <path d="M13 4h7v7h-7V4z" />
      <path d="M4 13h7v7H4v-7z" />
      <path d="M13 13h7v7h-7v-7z" />
    </Icon>
  );
}

function IconGoogle(props: { size?: number }) {
  // Not the official logo; simple "G" mark.
  return (
    <Icon size={props.size}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 12h-7" />
      <path d="M13 12v4" />
    </Icon>
  );
}

function IconPlus(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

type ToolTab = {
  id: 'pages' | 'image' | 'ink' | 'highlight' | 'text' | 'list' | 'shape';
  label: string;
};

const TOOL_TABS: ToolTab[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'image', label: 'Image' },
  { id: 'ink', label: 'Ink' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'text', label: 'Text' },
  { id: 'list', label: 'List' },
  { id: 'shape', label: 'Shape' },
];

function htmlToPlainText(html: string) {
  try {
    const el = document.createElement('div');
    el.innerHTML = html;
    const text = (el.innerText || el.textContent || '').trim();
    return text;
  } catch {
    return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function pageToText(page: ParserPage) {
  if (page.kind === 'html') return htmlToPlainText(page.html);
  return JSON.stringify(page.json, null, 2);
}

export function MobileEditor() {
    const isDirty = useDocumentStore((s) => s.isDirty);

    useEffect(() => {
      setCurrentEditedFlag(Boolean(isDirty));
    }, [isDirty]);

  const navigate = useNavigate();

  const status = useDocumentStore((s) => s.status);
  const isDev = import.meta.env.DEV;
  const isVerboseDebug = useMemo(() => {
    if (!isDev) return false;
    try {
      return window.localStorage?.getItem('xpdf:debug:verbose') === '1';
    } catch {
      return false;
    }
  }, [isDev]);

  const pushDevEvent = useCallback(
    (msg: string, extra?: unknown) => {
      if (!isDev) return;
      // Keep console clean by default; enable explicitly via localStorage.
      if (!isVerboseDebug) return;
      // eslint-disable-next-line no-console
      console.log(`[xpdf:debug] ${msg}`, extra ?? '');
    },
    [isDev, isVerboseDebug],
  );

  const doc = useDocumentStore((s) => s.doc);
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const setActivePage = useDocumentStore((s) => s.setActivePage);
  const zoom = useDocumentStore((s) => s.zoom);

  const loadPdfFromFile = useDocumentStore((s) => s.loadPdfFromFile);
  const newDoc = useDocumentStore((s) => s.newDoc);
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const updateOverlayObject = useDocumentStore((s) => s.updateOverlayObject);
  const setDocTitle = useDocumentStore((s) => s.setDocTitle);

  const tool = useUiStore((s) => s.tool);
  const toolProps = useUiStore((s) => s.toolProps);
  const setTool = useUiStore((s) => s.setTool);
  const setToolProp = useUiStore((s) => s.setToolProp);
  const orbitLauncherOpen = useUiStore((s) => s.orbitLauncherOpen);
  const setOrbitLauncherOpen = useUiStore((s) => s.setOrbitLauncherOpen);
  const selectedTextId = useUiStore((s) => s.selectedTextId);
  const setSelectedTextId = useUiStore((s) => s.setSelectedTextId);
  const selectedImageId = useUiStore((s) => s.selectedImageId);

  const exportStamps = useUiStore((s) => s.exportStamps);

  const initAuth = useGoogleStore((s) => s.initAuth);
  const auth = useGoogleStore((s) => s.auth);
  const isDashboardOpen = useGoogleStore((s) => s.isDashboardOpen);
  const openDashboard = useGoogleStore((s) => s.openDashboard);
  const closeDashboard = useGoogleStore((s) => s.closeDashboard);
  const connectDriveInteractive = useGoogleStore((s) => s.connectDriveInteractive);
  const isFirebaseAuthReady = useFirebaseUserStore((s) => s.isAuthReady);
  const firebaseUid = useFirebaseUserStore((s) => s.firebaseUser?.uid ?? null);

  const { parseFile } = useFileParser();

  useEffect(() => {
    // Preload GIS and restore any cached token WITHOUT prompting.
    // Keeps click-driven Drive popup from being blocked on first tap.
    if (!isFirebaseAuthReady) return;
    void initAuth();
  }, [initAuth, isFirebaseAuthReady, firebaseUid]);

  // No redirect handoff needed for Drive-click (we use Drive token -> Firebase credential).

  const [topMode, setTopMode] = useState<'editor' | 'thumbnail'>('editor');

  const [activeFeature, setActiveFeature] = useState<MobileFeatureId>('text');
  const propertyGroups = useMemo(() => getPropertyGroupsForFeature(activeFeature), [activeFeature]);
  const [propertyGroup, setPropertyGroup] = useState<MobilePropertyGroupId>('none');

  const sheetOpen = propertyGroup !== 'none';

  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const dataInputRef = useRef<HTMLInputElement | null>(null);

  const visuallyHiddenFileInputStyle: React.CSSProperties = {
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
  };

  const openFilePicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    try {
      // Ensure selecting the same file twice still fires change.
      input.value = '';
      pushDevEvent('picker-open', { accept: input.accept, multiple: input.multiple });

      const sp = (input as any).showPicker as undefined | (() => void);
      if (typeof sp === 'function') {
        sp.call(input);
        pushDevEvent('picker-showPicker');
      } else {
        input.click();
        pushDevEvent('picker-click');
      }
    } catch {
      try {
        input.click();
        pushDevEvent('picker-click-fallback');
      } catch {
        // ignore
      }
    }
  }, [pushDevEvent]);

  useEffect(() => {
    if (!isDev) return;
    if (!isVerboseDebug) return;
    pushDevEvent('store:status', status);
  }, [isDev, isVerboseDebug, pushDevEvent, status]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  const amber = '#fbbf24';
  const baseBg = '#020617';

  const filename = doc?.meta?.title || 'Untitled';

  // Generate thumbnails when in Thumbnail mode.
  useEffect(() => {
    let cancelled = false;
    if (topMode !== 'thumbnail') return () => {
      cancelled = true;
    };

    setThumbs({});
    clearEditorThumbnailCache();

    async function run() {
      if (!doc?.basePdfBytes) return;
      const pdf = await getPdfDocument(doc.basePdfBytes);
      const count = doc.pageCount ?? 0;

      for (let editorIndex = 0; editorIndex < count; editorIndex++) {
        if (cancelled) return;
        try {
          const originalIndex = doc.pageOrder[editorIndex] ?? editorIndex;
          const rotation = (doc.pageRotation[editorIndex] ?? 0) as any;
          const overlayObjects = (doc.overlays[editorIndex]?.objects ?? []) as any;

          // Keep cache invalidation simple in mobile thumbnail mode.
          const cacheKey = `mobileThumb:${doc.basePdfBytes.byteLength}:${doc.meta.updatedAt}:${originalIndex}:${rotation}`;
          // eslint-disable-next-line no-await-in-loop
          const url = await getEditorThumbnailDataUrlCached({
            pdf,
            cacheKey,
            originalPageIndex: originalIndex,
            pageRotation: rotation,
            overlayObjects,
            quality: 'low',
          });
          if (cancelled) return;
          setThumbs((prev) => ({ ...prev, [editorIndex]: url }));
        } catch {
          // ignore per-page failures
        }
      }
    }

    run().catch(() => {
      // ignore
    });

    return () => {
      cancelled = true;
    };
  }, [doc?.basePdfBytes, doc?.meta?.updatedAt, doc?.pageCount, doc?.pageOrder, doc?.pageRotation, doc?.overlays, topMode]);

  const selectedTextInfo = useMemo(() => {
    if (!doc || !selectedTextId) return null;
    for (let p = 0; p < doc.pageCount; p++) {
      const objs = doc.overlays[p]?.objects ?? [];
      const t = objs.find((o) => (o as any).id === selectedTextId && (o as any).type === 'text') as any;
      if (t) return { pageIndex: p, obj: t as TextObj };
    }
    return null;
  }, [doc, selectedTextId]);

  const selectedImageInfo = useMemo(() => {
    if (!doc || !selectedImageId) return null;
    for (let p = 0; p < doc.pageCount; p++) {
      const objs = doc.overlays[p]?.objects ?? [];
      const im = objs.find((o) => (o as any).id === selectedImageId && (o as any).type === 'image') as any;
      if (im) return { pageIndex: p, obj: im as any };
    }
    return null;
  }, [doc, selectedImageId]);

  // Keep the feature dropdown in sync when tool changes elsewhere.
  useEffect(() => {
    if (tool === 'pages') setActiveFeature('pages');
    else if (tool === 'text') setActiveFeature('text');
    else if (tool === 'image') setActiveFeature('image');
    else if (tool === 'ink') setActiveFeature('ink');
    else if (tool === 'highlight') setActiveFeature('highlight');
    else if (tool === 'list') setActiveFeature('list');
    else if (tool === 'shape') setActiveFeature('shape');
  }, [tool]);

  useEffect(() => {
    // When switching features, reset to collapsed properties by default.
    setPropertyGroup('none');
  }, [activeFeature]);

  const onTouchStartCapture = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      pinchRef.current = { startDist: Math.hypot(dx, dy), startZoom: zoom };
    }
  }, [zoom]);

  const onTouchMoveCapture = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      // Prevent page pinch-zoom when possible.
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / Math.max(1, pinchRef.current.startDist);
      const nextZoom = clamp(pinchRef.current.startZoom * scale, 0.25, 3);
      useDocumentStore.setState({ zoom: nextZoom });
    }
  }, []);

  const onTouchEndCapture = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  }, []);

  const ensureBlankPages = useCallback(async (targetPageCount: number) => {
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
        const insertAt = prev.doc.pageCount;
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
  }, []);

  const applyParsedToNewDoc = useCallback(async (result: ParserResult, title: string) => {
    await newDoc();
    setDocTitle(title);

    const pages = result.pages?.length ? result.pages : [];
    if (pages.length > 1) await ensureBlankPages(pages.length);

    const d = useDocumentStore.getState().doc;
    if (!d) return;
    const points = d.pageSizePoints?.length
      ? d.pageSizePoints.map((p) => ({ w: p.widthPoints, h: p.heightPoints }))
      : d.pageSizes;

    let firstTextId: string | null = null;

    pages.forEach((p, pageIndex) => {
      const ps = points?.[pageIndex] ?? points?.[0] ?? { w: 595, h: 842 };
      const text = pageToText(p);
      const id = createId('txt');
      if (!firstTextId) firstTextId = id;

      const obj: TextObj = {
        id,
        type: 'text',
        text,
        color: '#111111',
        fontSize: 12,
        font: { family: 'Helvetica', size: 12, bold: false, italic: false },
        strike: false,
        align: 'left',
        lineHeight: 1.25,
        rect: { x: 40, y: 40, w: Math.max(120, ps.w - 80), h: Math.max(120, ps.h - 80) },
      };
      addOverlayObject(pageIndex, obj as any);
    });

    if (firstTextId) {
      setTool('text');
      setActiveFeature('text');
      setSelectedTextId(firstTextId);
      setPropertyGroup('text-style');
    }

    setOrbitLauncherOpen(false);
  }, [addOverlayObject, ensureBlankPages, newDoc, setDocTitle, setOrbitLauncherOpen, setSelectedTextId, setTool]);

  const runImportImagesToBlankDoc = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

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

    const margin = 26;
    const gap = 10;
    const availW = Math.max(1, page0.w - margin * 2);
    const availH = Math.max(1, page0.h - margin * 2);
    const n = items.length;

    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));

    const cellW = (availW - gap * (cols - 1)) / cols;
    const cellH = (availH - gap * (rows - 1)) / rows;

    let firstId: string | null = null;

    items.forEach((it, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);

      const x0 = margin + c * (cellW + gap);
      const y0 = margin + r * (cellH + gap);

      const scale = Math.min(cellW / it.dims.w, cellH / it.dims.h);
      const w = Math.max(12, it.dims.w * scale);
      const h = Math.max(12, it.dims.h * scale);
      const x = x0 + (cellW - w) / 2;
      const y = y0 + (cellH - h) / 2;

      const id = createId('img');
      if (!firstId) firstId = id;

      addOverlayObject(0, {
        id,
        type: 'image',
        src: it.dataUrl,
        name: it.file.name,
        mask: { type: 'none' },
        transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
        filters: { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0, invert: 0 },
        opacity: 1,
        borderRadius: 0,
        rect: { x, y, w, h },
      } as any);
    });

    setTool('image');
    if (firstId) useUiStore.getState().setSelectedImageId(firstId);
    setOrbitLauncherOpen(false);
  }, [addOverlayObject, newDoc, setOrbitLauncherOpen, setTool]);

  const onExport = useCallback(() => {
    if (!doc) return;
    void (async () => {
      try {
        const indices = Array.from({ length: doc.pageCount }, (_, i) => i);
        const bytes = await exportPagesFromModel({ doc, pageIndices: indices, stampSettings: exportStamps });
        const filename = `${doc.meta.title || 'document'}.pdf`;
        downloadBytes(bytes, filename, 'application/pdf');
        void logFileExported(filename, 'local');
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Export failed');
      }
    })();
  }, [doc, exportStamps]);

  const applyTextPatch = useCallback((patch: Partial<TextObj>) => {
    const info = selectedTextInfo;
    if (!info) return;
    updateOverlayObject(info.pageIndex, info.obj.id, patch as any);
  }, [selectedTextInfo, updateOverlayObject]);

  const applyImagePatch = useCallback((patch: Record<string, any>) => {
    const info = selectedImageInfo;
    if (!info) return;
    updateOverlayObject(info.pageIndex, info.obj.id, patch as any);
  }, [selectedImageInfo, updateOverlayObject]);

  const ensureTextObjectForEdit = useCallback(() => {
    if (selectedTextId) return;
    const d = useDocumentStore.getState().doc;
    if (!d) return;
    const ps = d.pageSizePoints?.[activePageIndex]
      ? { w: d.pageSizePoints[activePageIndex].widthPoints, h: d.pageSizePoints[activePageIndex].heightPoints }
      : (d.pageSizes?.[activePageIndex] ?? { w: 595, h: 842 });
    const id2 = createId('txt');
    const obj: TextObj = {
      id: id2,
      type: 'text',
      text: 'Tap to edit',
      color: toolProps.color,
      fontSize: toolProps.fontSize,
      font: { family: 'Helvetica', size: toolProps.fontSize, bold: false, italic: false },
      strike: false,
      align: 'left',
      lineHeight: 1.25,
      rect: { x: 32, y: 80, w: Math.max(160, ps.w - 64), h: 120 },
    };
    addOverlayObject(activePageIndex, obj as any);
    setSelectedTextId(id2);
  }, [activePageIndex, addOverlayObject, selectedTextId, setSelectedTextId, toolProps.color, toolProps.fontSize]);

  const headerStyle: React.CSSProperties = {
    height: 54,
    padding: '10px 12px',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.05)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  const glassBar: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: '0 0 auto',
    height: 40,
    padding: '0 14px',
    borderRadius: 999,
    border: active ? `1px solid rgba(251,191,36,0.55)` : '1px solid rgba(255,255,255,0.10)',
    background: active ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.04)',
    color: active ? amber : 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.2,
    boxShadow: active ? `0 0 18px rgba(251,191,36,0.22)` : 'none',
  });

  const dockStyle: React.CSSProperties = {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    height: 66,
    borderRadius: 22,
    display: 'grid',
    gridTemplateColumns: '56px 56px 1fr 1fr',
    alignItems: 'center',
    padding: '0 10px',
    boxShadow: '0 22px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset',
    ...glassBar,
  };

  const dockIconBtn = (active: boolean): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: active ? `1px solid rgba(251,191,36,0.45)` : '1px solid rgba(255,255,255,0.08)',
    color: active ? amber : 'rgba(255,255,255,0.82)',
    boxShadow: active ? `0 0 16px rgba(251,191,36,0.18)` : 'none',
  });

  const dockSelectStyle: React.CSSProperties = {
    height: 42,
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
    letterSpacing: 0.6,
    boxShadow: 'none',
    paddingRight: 28,
  };

  const bottomSheetStyle: React.CSSProperties = {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 86,
    height: '40%',
    borderRadius: 22,
    padding: 14,
    transform: sheetOpen ? 'translateY(0)' : 'translateY(calc(100% + 140px))',
    opacity: sheetOpen ? 1 : 0,
    pointerEvents: sheetOpen ? 'auto' : 'none',
    transition: 'transform 220ms ease, opacity 160ms ease',
    boxShadow: '0 24px 70px rgba(0,0,0,0.68), 0 0 0 1px rgba(255,255,255,0.07) inset',
    ...glassBar,
  };

  return (
    <div
      className="mobileEditorRoot"
      style={{
        height: '100dvh',
        overflow: 'hidden',
        background: baseBg,
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              height: 34,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.92)',
              fontWeight: 900,
              letterSpacing: 0.8,
            }}
            aria-label="Home"
          >
            Home
          </button>

          <select
            value={topMode}
            onChange={(e) => {
              const v = e.target.value === 'thumbnail' ? 'thumbnail' : 'editor';
              setTopMode(v);
            }}
            className="iosSelect"
            style={{
              height: 34,
              paddingTop: 6,
              paddingBottom: 6,
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.92)',
              boxShadow: 'none',
              borderRadius: 12,
            }}
            aria-label="View mode"
          >
            <option value="thumbnail">Thumbnail</option>
            <option value="editor">Editor</option>
          </select>
        </div>

        <div style={{ overflow: 'hidden' }}>
          <div
            title={filename}
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.6,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'rgba(255,255,255,0.92)',
              textAlign: 'center',
            }}
          >
            {filename}
          </div>
        </div>

        <button
          type="button"
          onClick={onExport}
          style={{
            height: 34,
            padding: '0 14px',
            borderRadius: 12,
            border: '1px solid rgba(251,191,36,0.55)',
            background: 'rgba(251,191,36,0.12)',
            color: amber,
            fontWeight: 900,
            letterSpacing: 1.1,
            boxShadow: '0 0 18px rgba(251,191,36,0.18)',
          }}
        >
          Export
        </button>
      </div>

      <div
        ref={viewportRef}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          background: '#0b1223',
        }}
      >
        {topMode === 'thumbnail' ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: 12,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {!doc?.basePdfBytes ? (
              <div style={{ padding: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>Open a PDF to see pages.</div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {Array.from({ length: doc.pageCount }, (_, i) => i).map((pageIndex) => {
                  const isActive = pageIndex === activePageIndex;
                  const src = thumbs[pageIndex];
                  return (
                    <button
                      key={pageIndex}
                      type="button"
                      onClick={() => {
                        setActivePage(pageIndex);
                        setTopMode('editor');
                      }}
                      style={{
                        borderRadius: 14,
                        border: isActive ? '1px solid rgba(251,191,36,0.55)' : '1px solid rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.04)',
                        padding: 10,
                        boxShadow: isActive ? '0 0 18px rgba(251,191,36,0.16)' : 'none',
                        textAlign: 'left',
                      }}
                      aria-label={`Page ${pageIndex + 1}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.0, color: 'rgba(255,255,255,0.90)' }}>
                          {pageIndex + 1}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: isActive ? amber : 'rgba(255,255,255,0.60)' }}>
                          {isActive ? 'ACTIVE' : ''}
                        </div>
                      </div>

                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '3 / 4',
                          borderRadius: 10,
                          background: 'rgba(0,0,0,0.22)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {src ? (
                          <img
                            src={src}
                            alt={`Page ${pageIndex + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                          />
                        ) : (
                          <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>Loading…</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            onTouchStartCapture={onTouchStartCapture}
            onTouchMoveCapture={onTouchMoveCapture}
            onTouchEndCapture={onTouchEndCapture}
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 110,
              touchAction: 'pan-y',
            }}
          >
            <div style={{ minHeight: '100%', padding: 0 }}>
              <PdfCanvas />
            </div>
          </div>
        )}

        {/* Bottom sheet (feature properties) */}
        <div style={bottomSheetStyle} role={sheetOpen ? 'dialog' : undefined} aria-hidden={!sheetOpen}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, letterSpacing: 1.1, color: 'rgba(255,255,255,0.92)' }}>
              {activeFeature.toUpperCase()} • {propertyGroup === 'none' ? '' : propertyGroups.find((g) => g.id === propertyGroup)?.label}
            </div>
            <button
              type="button"
              onClick={() => setPropertyGroup('none')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.88)',
                display: 'grid',
                placeItems: 'center',
              }}
              aria-label="Close"
            >
              <IconClose size={18} />
            </button>
          </div>

          {/* Properties content changes by feature + group */}
          {propertyGroup === 'page' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setActivePage(activePageIndex - 1)}
                style={{ height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', fontWeight: 900, letterSpacing: 1.1 }}
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setActivePage(activePageIndex + 1)}
                style={{ height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', fontWeight: 900, letterSpacing: 1.1 }}
              >
                Next
              </button>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: 800 }}>
                Page {activePageIndex + 1} / {doc?.pageCount ?? 0}
              </div>
            </div>
          ) : null}

          {propertyGroup === 'text-style' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Color</div>
                <input
                  type="color"
                  value={(selectedTextInfo?.obj?.color ?? toolProps.color) || '#111111'}
                  onChange={(e) => {
                    const c = e.target.value;
                    setToolProp('color', c);
                    applyTextPatch({ color: c });
                  }}
                  style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Font size</div>
                <input
                  type="range"
                  min={8}
                  max={48}
                  value={selectedTextInfo?.obj?.fontSize ?? toolProps.fontSize}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 12;
                    setToolProp('fontSize', v);
                    applyTextPatch({ fontSize: v, font: { ...(selectedTextInfo?.obj?.font ?? { family: 'Helvetica', size: v }), size: v } });
                  }}
                />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>{selectedTextInfo?.obj?.fontSize ?? toolProps.fontSize}px</div>
              </div>

              <button
                type="button"
                onClick={() => {
                  ensureTextObjectForEdit();
                  const current = selectedTextInfo?.obj?.font?.bold ?? false;
                  applyTextPatch({ font: { ...(selectedTextInfo?.obj?.font ?? { family: 'Helvetica', size: selectedTextInfo?.obj?.fontSize ?? toolProps.fontSize }), bold: !current } });
                }}
                style={{
                  height: 44,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: selectedTextInfo?.obj?.font?.bold ? amber : 'rgba(255,255,255,0.90)',
                  fontWeight: 900,
                  letterSpacing: 1.1,
                  boxShadow: selectedTextInfo?.obj?.font?.bold ? '0 0 18px rgba(251,191,36,0.16)' : 'none',
                }}
              >
                Bold
              </button>

              <button
                type="button"
                onClick={() => {
                  ensureTextObjectForEdit();
                  const current = selectedTextInfo?.obj?.font?.italic ?? false;
                  applyTextPatch({ font: { ...(selectedTextInfo?.obj?.font ?? { family: 'Helvetica', size: selectedTextInfo?.obj?.fontSize ?? toolProps.fontSize }), italic: !current } });
                }}
                style={{
                  height: 44,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.04)',
                  color: selectedTextInfo?.obj?.font?.italic ? amber : 'rgba(255,255,255,0.90)',
                  fontWeight: 900,
                  letterSpacing: 1.1,
                  boxShadow: selectedTextInfo?.obj?.font?.italic ? '0 0 18px rgba(251,191,36,0.16)' : 'none',
                }}
              >
                Italic
              </button>
            </div>
          ) : null}

          {propertyGroup === 'text-layout' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Line height</div>
              <input
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={selectedTextInfo?.obj?.lineHeight ?? 1.25}
                onChange={(e) => {
                  ensureTextObjectForEdit();
                  const v = Number(e.target.value) || 1.25;
                  applyTextPatch({ lineHeight: v });
                }}
              />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>{(selectedTextInfo?.obj?.lineHeight ?? 1.25).toFixed(2)}</div>
            </div>
          ) : null}

          {propertyGroup === 'image-style' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Opacity</div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selectedImageInfo?.obj?.opacity ?? 1}
                onChange={(e) => applyImagePatch({ opacity: Number(e.target.value) })}
              />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>{Math.round(((selectedImageInfo?.obj?.opacity ?? 1) as number) * 100)}%</div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Corner radius</div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={selectedImageInfo?.obj?.borderRadius ?? 0}
                onChange={(e) => applyImagePatch({ borderRadius: Number(e.target.value) })}
              />
            </div>
          ) : null}

          {propertyGroup === 'image-adjust' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Brightness</div>
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.01}
                value={selectedImageInfo?.obj?.filters?.brightness ?? 1}
                onChange={(e) => applyImagePatch({ filters: { ...(selectedImageInfo?.obj?.filters ?? {}), brightness: Number(e.target.value) } })}
              />
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Contrast</div>
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.01}
                value={selectedImageInfo?.obj?.filters?.contrast ?? 1}
                onChange={(e) => applyImagePatch({ filters: { ...(selectedImageInfo?.obj?.filters ?? {}), contrast: Number(e.target.value) } })}
              />
            </div>
          ) : null}

          {propertyGroup === 'ink-style' || propertyGroup === 'highlight-style' || propertyGroup === 'list-style' || propertyGroup === 'shape-style' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>Color</div>
                <input
                  type="color"
                  value={toolProps.color}
                  onChange={(e) => setToolProp('color', e.target.value)}
                  style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: 'rgba(255,255,255,0.78)' }}>{activeFeature === 'ink' || activeFeature === 'shape' ? 'Width' : 'Opacity'}</div>
                <input
                  type="range"
                  min={activeFeature === 'ink' || activeFeature === 'shape' ? 1 : 0.05}
                  max={activeFeature === 'ink' || activeFeature === 'shape' ? 12 : 1}
                  step={activeFeature === 'ink' || activeFeature === 'shape' ? 1 : 0.01}
                  value={activeFeature === 'ink' || activeFeature === 'shape' ? toolProps.width : toolProps.opacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (activeFeature === 'ink' || activeFeature === 'shape') setToolProp('width', v);
                    else setToolProp('opacity', v);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Dock: gdrive-dock | launcher | properties-dropdown | features-dropdown */}
        {topMode === 'editor' ? (
          <div style={dockStyle}>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <button
                type="button"
                style={dockIconBtn(auth?.isSignedIn ? true : false)}
                onClick={() => {
                  if (auth?.isSignedIn) {
                    if (isDashboardOpen) closeDashboard();
                    else openDashboard();
                    return;
                  }

                  // Open immediately so the user sees loading/errors.
                  openDashboard();
                  void (async () => {
                    try {
                      const ok = await connectDriveInteractive();
                      if (!ok) {
                        const msg = useGoogleStore.getState().lastDriveError;
                        if (msg && msg.toLowerCase().includes('initializing')) alert(msg);
                        return;
                      }
                      // Dashboard is already open; auth + file list will update as the store refresh completes.
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Google sign-in failed');
                    }
                  })();
                }}
                aria-label="Google"
              >
                <IconGoogle />
              </button>
            </div>

            <div style={{ display: 'grid', placeItems: 'center' }}>
              <button
                type="button"
                style={dockIconBtn(orbitLauncherOpen)}
                onClick={() => setOrbitLauncherOpen(true)}
                aria-label="Launcher"
              >
                <IconPlus />
              </button>
            </div>

            <div className="iosSelectWrap" style={{ paddingRight: 6 }}>
              <select
                value={propertyGroup}
                onChange={(e) => {
                  const v = e.target.value as MobilePropertyGroupId;
                  setPropertyGroup(v);
                  if (v !== 'none' && activeFeature === 'text') ensureTextObjectForEdit();
                }}
                className="iosSelect"
                style={dockSelectStyle}
                aria-label="Properties"
              >
                {propertyGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="iosSelectWrap" style={{ paddingRight: 6 }}>
              <select
                value={activeFeature}
                onChange={(e) => {
                  const v = e.target.value as MobileFeatureId;
                  setActiveFeature(v);
                  setTool(v);
                }}
                className="iosSelect"
                style={dockSelectStyle}
                aria-label="Feature"
              >
                {MOBILE_FEATURES.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {/* Hidden inputs */}
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={visuallyHiddenFileInputStyle}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            pushDevEvent('input-change:pdf', { name: file.name, type: file.type, size: file.size });
            try {
              await loadPdfFromFile(file);
              void logFileOpened(file.name, 'local');
              pushDevEvent('loadPdfFromFile:done');
              setOrbitLauncherOpen(false);
            } catch (err) {
              pushDevEvent('loadPdfFromFile:error', err);
              alert(err instanceof Error ? err.message : 'Failed to load PDF');
            }
          }}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={visuallyHiddenFileInputStyle}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
            e.currentTarget.value = '';
            if (!files.length) return;
            pushDevEvent('input-change:img', {
              count: files.length,
              first: { name: files[0]?.name, type: files[0]?.type, size: files[0]?.size },
            });
            void runImportImagesToBlankDoc(files);
            setOrbitLauncherOpen(false);
          }}
        />

        <input
          ref={docsInputRef}
          type="file"
          accept=".docx,.odt,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={visuallyHiddenFileInputStyle}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            pushDevEvent('input-change:docs', { name: file.name, type: file.type, size: file.size });
            void (async () => {
              try {
                const res = await parseFile(file);
                await applyParsedToNewDoc(res, file.name);
                void logFileOpened(file.name, 'local');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to parse file');
              }
            })();
          }}
        />

        <input
          ref={dataInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.epub,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/epub+zip"
          style={visuallyHiddenFileInputStyle}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            pushDevEvent('input-change:data', { name: file.name, type: file.type, size: file.size });
            void (async () => {
              try {
                const res = await parseFile(file);
                await applyParsedToNewDoc(res, file.name);
                void logFileOpened(file.name, 'local');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed to parse file');
              }
            })();
          }}
        />

        {/* Optional: keep existing launcher available */}
        <OrbitLauncher
          open={orbitLauncherOpen}
          onClose={() => setOrbitLauncherOpen(false)}
          onDebugEvent={(msg) => {
            pushDevEvent(msg);
          }}
          onSelect={(id) => {
            // Minimal: keep existing IDs consistent with desktop launcher.
            if (id === 'pdf') {
              pushDevEvent('launcher-select:pdf');
              openFilePicker(pdfInputRef.current);
              setOrbitLauncherOpen(false);
            } else if (id === 'img') {
              pushDevEvent('launcher-select:img');
              openFilePicker(imageInputRef.current);
              setOrbitLauncherOpen(false);
            } else if (id === 'docx') {
              pushDevEvent('launcher-select:docs');
              openFilePicker(docsInputRef.current);
              setOrbitLauncherOpen(false);
            } else if (id === 'txt') {
              pushDevEvent('launcher-select:data');
              openFilePicker(dataInputRef.current);
              setOrbitLauncherOpen(false);
            }
            else if (id === 'gdrive') {
              if (auth?.isSignedIn) {
                if (isDashboardOpen) closeDashboard();
                else openDashboard();
              } else {
                // Open immediately so the user sees loading/errors.
                openDashboard();
                void (async () => {
                  try {
                    const ok = await connectDriveInteractive();
                    if (!ok) {
                      const msg = useGoogleStore.getState().lastDriveError;
                      if (msg && msg.toLowerCase().includes('initializing')) alert(msg);
                      return;
                    }
                    // Dashboard is already open; auth + file list will update as the store refresh completes.
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Google sign-in failed');
                  }
                })();
              }
            } else if (id === 'new') {
              void newDoc();
            }
          }}
        />
      </div>

      {isDashboardOpen ? <DriveDashboard /> : null}

      {/* Component-local styles (keeps global CSS untouched) */}
      <style>
        {`
          @supports (height: 100dvh) {
            .mobileEditorRoot { height: 100dvh; }
          }
        `}
      </style>
    </div>
  );
}
