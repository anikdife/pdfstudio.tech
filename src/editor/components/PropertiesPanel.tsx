import { useEffect, useMemo, useRef, useState } from 'react';
import { logFileOpened } from '../../services/firebaseActivity';
import { useUiStore } from '../state/uiStore';
import { WatermarkPageNumbersPanel } from './modals/WatermarkPageNumbersPanel';
import { useDocumentStore } from '../state/documentStore';
import { TextToolbar, type TextStylePatch } from './TextToolbar';
import { ListToolbar, type ListStylePatch } from './ListToolbar';
import { ShapePanel } from './ShapePanel';
import { createId } from '../util/ids';
import { ImageMaskPicker } from './ImageMaskPicker';
import { downloadBytes, downloadZipFiles } from '../util/file';
import { exportPagesFromModel } from '../pageops/extract';
import { appendBlankPage, appendImagePage } from '../pageops/insert';
import { mergePdfBytes } from '../pageops/merge';
import { mergePlusFilesToFile } from '../util/mergePlus';
import { splitPdfByRanges } from '../pageops/split';
import { reorderPdfBytes } from '../pageops/reorder';
import { getPdfDocument } from '../pdf/render';
import { extractImagesFromPage } from '../pdf/extractImages';
import { MergePdfModal } from './modals/MergePdfModal';
import { SplitModal } from './modals/SplitModal';
import {
  PAGE_SIZE_PRESETS,
  type PageSizeUnit,
  findPresetForSize,
  formatSize,
  sizeToUnit,
  unitToPoints,
} from '../util/pageSizes';

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 16H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 9h11v11H9z" />
      <path d="M4 15H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function PropertiesPanel() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const toolProps = useUiStore((s) => s.toolProps);
  const setToolProp = useUiStore((s) => s.setToolProp);
  const setFilePickerOpen = useUiStore((s) => s.setFilePickerOpen);
  const setImageUiStatus = useUiStore((s) => s.setImageUiStatus);
  const selectedTextId = useUiStore((s) => s.selectedTextId);
  const setSelectedTextId = useUiStore((s) => s.setSelectedTextId);
  const setEditingTextId = useUiStore((s) => s.setEditingTextId);
  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const setSelectedImageId = useUiStore((s) => s.setSelectedImageId);
  const selectedListId = useUiStore((s) => s.selectedListId);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setEditingListId = useUiStore((s) => s.setEditingListId);

  const doc = useDocumentStore((s) => s.doc);
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const setActivePage = useDocumentStore((s) => s.setActivePage);
  const loadPdfFromFile = useDocumentStore((s) => s.loadPdfFromFile);
  const rotatePage = useDocumentStore((s) => s.rotatePage);
  const deletePage = useDocumentStore((s) => s.deletePage);
  const deletePages = useDocumentStore((s) => s.deletePages);
  const rotatePages = useDocumentStore((s) => s.rotatePages);
  const setPageCrop = useDocumentStore((s) => s.setPageCrop);
  const updateOverlayObject = useDocumentStore((s) => s.updateOverlayObject);
  const removeOverlayObject = useDocumentStore((s) => s.removeOverlayObject);
  const duplicateOverlayObject = useDocumentStore((s) => s.duplicateOverlayObject);
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const setPageSizeForPages = useDocumentStore((s) => s.setPageSizeForPages);

  const selectedLinkId = useDocumentStore((s) => s.selectedLinkId);
  const setSelectedLinkId = useDocumentStore((s) => s.setSelectedLinkId);
  const updateLinkMark = useDocumentStore((s) => s.updateLinkMark);
  const removeLinkMark = useDocumentStore((s) => s.removeLinkMark);
  const listLinkMarks = useDocumentStore((s) => s.listLinkMarks);

  const selectedPageIndices = useUiStore((s) => s.selectedPageIndices);
  const clearPageSelection = useUiStore((s) => s.clearPageSelection);

  const cropMode = useUiStore((s) => s.cropMode);
  const setCropMode = useUiStore((s) => s.setCropMode);
  const cropDraftByPage = useUiStore((s) => s.cropDraftByPage);
  const clearCropDraft = useUiStore((s) => s.clearCropDraft);

  const exportStamps = useUiStore((s) => s.exportStamps);

  const linkDestPick = useUiStore((s) => s.linkDestPick);
  const setLinkDestPick = useUiStore((s) => s.setLinkDestPick);

  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [extractPlusOpen, setExtractPlusOpen] = useState(false);
  const [extractPlusSpec, setExtractPlusSpec] = useState('');
  const [extractPlusCombined, setExtractPlusCombined] = useState(false);
  const [mergePlusOpen, setMergePlusOpen] = useState(false);
  const [mergePlusFiles, setMergePlusFiles] = useState<File[]>([]);

  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<number[]>([]);
  const [reorderDragFrom, setReorderDragFrom] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const insertImageInputRef = useRef<HTMLInputElement | null>(null);

  const canEditPaint = tool === 'ink' || tool === 'highlight' || tool === 'text' || tool === 'list';

  const selectedLink = useMemo(() => {
    if (!doc || !selectedLinkId) return null as any;
    for (const marks of Object.values(doc.linksByPage ?? {})) {
      const hit = (marks ?? []).find((m) => m.id === selectedLinkId);
      if (hit) return hit as any;
    }
    return null as any;
  }, [doc, selectedLinkId]);

  const [linkKindDraft, setLinkKindDraft] = useState<'external' | 'internal'>('external');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const [linkShowLabelDraft, setLinkShowLabelDraft] = useState<boolean>(true);
  const [linkInternalPageDraft, setLinkInternalPageDraft] = useState<number>(0);
  const [linkInternalXDraft, setLinkInternalXDraft] = useState<string>('');
  const [linkInternalYDraft, setLinkInternalYDraft] = useState<string>('');
  const [linkInternalZoomDraft, setLinkInternalZoomDraft] = useState<string>('');

  useEffect(() => {
    if (!selectedLink) return;
    const t = selectedLink.target as any;
    if (t?.kind === 'internal') {
      setLinkKindDraft('internal');
      setLinkInternalPageDraft(Number(t.pageIndex) || 0);
      setLinkUrlDraft('');
      setLinkShowLabelDraft(true);
      setLinkInternalXDraft(Number.isFinite(t.x) ? String(t.x) : '');
      setLinkInternalYDraft(Number.isFinite(t.y) ? String(t.y) : '');
      setLinkInternalZoomDraft(Number.isFinite(t.zoom) ? String(t.zoom) : '');
      return;
    }
    setLinkKindDraft('external');
    setLinkUrlDraft(String(t?.url ?? ''));
    setLinkShowLabelDraft((selectedLink as any)?.showLabel !== false);
    setLinkInternalPageDraft(0);
    setLinkInternalXDraft('');
    setLinkInternalYDraft('');
    setLinkInternalZoomDraft('');
  }, [selectedLink]);

  const normalizeExternalUrl = (raw: string) => {
    const url = String(raw || '').trim();
    if (!url) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
    return `https://${url}`;
  };

  const imageDebugEnabled = (() => {
    try {
      return window.localStorage?.getItem('xpdf:debug:image') === '1';
    } catch {
      return false;
    }
  })();

  const imageDevUiEnabled = Boolean(import.meta.env.DEV) || imageDebugEnabled;

  const setStatus = (text: string) => {
    if (!imageDevUiEnabled) return;
    setImageUiStatus(text);
  };

  const handlePickedImageFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(`Picker: not an image (${file.type || 'unknown'})`);
      return;
    }

    const curDoc = useDocumentStore.getState().doc;
    if (!curDoc) {
      setStatus('Picker: no doc in store');
      return;
    }

    const pageIndex = useDocumentStore.getState().activePageIndex;

    const imgDbg = (msg: string, extra?: any) => {
      if (!imageDebugEnabled) return;
      try {
        // eslint-disable-next-line no-console
        console.log(`[xpdf:image] ${msg}`, extra ?? '');
      } catch {
        // ignore
      }
    };

    imgDbg('picker:selected', {
      name: file.name,
      type: file.type,
      size: file.size,
      pageIndex,
      hasDoc: Boolean(useDocumentStore.getState().doc),
    });
    setStatus(`Picker: selected ${file.name} (${Math.round(file.size / 1024)}kb)`);

    const objectUrl = URL.createObjectURL(file);
    imgDbg('objectUrl:created', { objectUrl });

    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = objectUrl;
    });
    imgDbg('dims', dims);

    const pageSize = getEffectivePageSizePoints(pageIndex, curDoc);
    const maxW = Math.max(80, Math.min(300, pageSize.w - 40));
    const w = maxW;
    const h = Math.max(40, (maxW * dims.h) / Math.max(1, dims.w));
    const x = Math.max(0, (pageSize.w - w) / 2);
    const y = Math.max(0, (pageSize.h - h) / 2);

    const id = createId('img');
    imgDbg('overlay:add:begin', { id, pageIndex });
    addOverlayObject(pageIndex, {
      id,
      type: 'image',
      src: objectUrl,
      name: file.name,
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

    setSelectedImageId(id);
    setStatus(`Picker: added id=${id} (page=${pageIndex + 1})`);

    void (async () => {
      let patched = false;
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
          reader.readAsDataURL(file);
        });
        updateOverlayObject(pageIndex, id, { src: dataUrl } as any);
        patched = true;
        imgDbg('src:patched:dataUrl', { id, len: dataUrl.length });
      } catch {
        imgDbg('src:patchFailed', { id });
      } finally {
        try {
          const curDoc2 = useDocumentStore.getState().doc;
          const curObj = (curDoc2?.overlays?.[pageIndex]?.objects ?? []).find((o: any) => o?.id === id) as any;
          const stillUsingObjectUrl = Boolean(curObj) && String(curObj?.src ?? '') === objectUrl;
          imgDbg('objectUrl:revoke:check', {
            id,
            patched,
            curObj: Boolean(curObj),
            stillUsingObjectUrl,
          });
          if (!stillUsingObjectUrl && (patched || !curObj)) {
            URL.revokeObjectURL(objectUrl);
            imgDbg('objectUrl:revoked', { id });
          }
        } catch {
          // ignore
        }
      }
    })();
  };

  useEffect(() => {
    const onFocus = () => {
      // File picker (OS dialog) typically steals focus; clear the flag when focus returns.
      setFilePickerOpen(false);
      setStatus('Picker: focus return');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [setFilePickerOpen]);

  const getEffectivePageSizePoints = (
    pageIndex: number,
    forDoc: typeof doc | null = doc,
  ): { w: number; h: number; presetId: string | null } => {
    const points = forDoc?.pageSizePoints?.[pageIndex];
    if (points) {
      return {
        w: points.widthPoints,
        h: points.heightPoints,
        presetId: points.presetId ?? null,
      };
    }
    const legacy = forDoc?.pageSizes?.[pageIndex];
    return { w: legacy?.w ?? 595, h: legacy?.h ?? 842, presetId: null };
  };

  const getDefaultBlankPageSizePoints = (): { w: number; h: number; presetId: string | null } => {
    if (doc?.defaultPageSizePoints) {
      return {
        w: doc.defaultPageSizePoints.widthPoints,
        h: doc.defaultPageSizePoints.heightPoints,
        presetId: doc.defaultPageSizePoints.presetId ?? null,
      };
    }
    return getEffectivePageSizePoints(activePageIndex);
  };

  const [pageSizeUnit, setPageSizeUnit] = useState<PageSizeUnit>('mm');
  const [pageSizePresetId, setPageSizePresetId] = useState<string>('a4');
  const [pageSizeOrientation, setPageSizeOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSizeW, setPageSizeW] = useState<number>(210);
  const [pageSizeH, setPageSizeH] = useState<number>(297);
  const [pageSizeSetAsDefault, setPageSizeSetAsDefault] = useState<boolean>(false);

  const getTargetPages = () => {
    if (!doc) return [] as number[];
    return selectedPageIndices.length > 0 ? selectedPageIndices : [activePageIndex];
  };

  const pageSizeSelection = useMemo(() => {
    if (!doc) return null;
    const targets = selectedPageIndices.length > 0 ? selectedPageIndices : [activePageIndex];
    if (targets.length === 0) return null;

    const sizes = targets.map((idx) => getEffectivePageSizePoints(idx));
    const first = sizes[0];
    const tol = 0.75;
    const mixed = sizes.some((s) => Math.abs(s.w - first.w) > tol || Math.abs(s.h - first.h) > tol);
    const match = !mixed ? findPresetForSize({ w: first.w, h: first.h }) : null;
    return {
      mixed,
      size: { w: first.w, h: first.h },
      presetId: match?.preset.id ?? null,
      presetLabel: match?.preset.label ?? null,
      orientation: match?.orientation ?? (first.w >= first.h ? 'landscape' : 'portrait'),
      count: targets.length,
    };
  }, [doc, activePageIndex, selectedPageIndices]);

  useEffect(() => {
    if (tool !== 'pages') return;
    if (!doc) return;
    if (!pageSizeSelection || pageSizeSelection.mixed) return;

    const { size, presetId, orientation } = pageSizeSelection;
    setPageSizePresetId(presetId ?? 'custom');
    setPageSizeOrientation(orientation);

    const converted = sizeToUnit({ w: size.w, h: size.h }, pageSizeUnit);
    const round = (n: number) => (pageSizeUnit === 'pt' ? Math.round(n) : Math.round(n * 10) / 10);
    setPageSizeW(round(converted.w));
    setPageSizeH(round(converted.h));
  }, [tool, doc, pageSizeSelection, pageSizeUnit]);

  const openReorder = () => {
    if (!doc?.basePdfBytes) return;
    const count = doc.pageCount;
    setReorderDraft(Array.from({ length: count }, (_, i) => i));
    setReorderDragFrom(null);
    setReorderOpen(true);
  };

  const closeReorder = () => {
    setReorderOpen(false);
    setReorderDragFrom(null);
  };

  const getInsertAfterIndex = () => {
    const targets = getTargetPages();
    if (targets.length === 0) return activePageIndex;
    return Math.max(...targets);
  };

  const parseExtractPlusPages = (spec: string) => {
    if (!doc) return [] as number[];
    const pageCount = doc.pageCount;

    const raw = String(spec || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (raw.length === 0) return [] as number[];

    const out: number[] = [];
    const seen = new Set<number>();

    const addIndex = (idx: number) => {
      if (!Number.isFinite(idx)) return;
      if (idx < 0 || idx >= pageCount) return;
      if (seen.has(idx)) return;
      seen.add(idx);
      out.push(idx);
    };

    for (const token of raw) {
      const m = token.match(/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/);
      if (!m) continue;
      const a = Math.max(1, Number(m[1] || 0));
      const b = m[2] != null ? Math.max(1, Number(m[2] || 0)) : a;
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let p = start; p <= end; p++) {
        addIndex(p - 1);
      }
    }

    return out.sort((x, y) => x - y);
  };

  const selectedTextObj =
    selectedTextId && doc
      ? (doc.overlays[activePageIndex]?.objects ?? []).find((o) => o.type === 'text' && o.id === selectedTextId) ?? null
      : null;

  const selectedListObj =
    selectedListId && doc
      ? (doc.overlays[activePageIndex]?.objects ?? []).find((o) => o.type === 'list' && (o as any).id === selectedListId) ?? null
      : null;

  const applyTextPatch = (patch: TextStylePatch) => {
    if (!selectedTextObj || selectedTextObj.type !== 'text') return;

    const currentFont = selectedTextObj.font ?? {
      family: 'Helvetica',
      size: selectedTextObj.fontSize ?? 16,
      bold: false,
      italic: false,
    };
    const nextFont = patch.font ? { ...currentFont, ...patch.font } : currentFont;

    const currentBorder = selectedTextObj.border ?? {
      color: '#e5e5e5',
      width: 0,
      style: 'none' as const,
    };
    const hasBorder = Boolean(selectedTextObj.border) || Boolean(patch.border);
    const nextBorder = patch.border ? { ...currentBorder, ...patch.border } : currentBorder;

    updateOverlayObject(activePageIndex, selectedTextObj.id, {
      ...patch,
      font: nextFont,
      ...(hasBorder ? { border: nextBorder } : null),
      // keep legacy fields in sync for older render paths
      fontSize: nextFont.size,
      color: patch.color ?? selectedTextObj.color,
    } as any);
  };

  const applyListPatch = (patch: ListStylePatch) => {
    if (!selectedListObj || (selectedListObj as any).type !== 'list') return;

    const currentFont = (selectedListObj as any).font ?? {
      family: 'Helvetica',
      size: (selectedListObj as any).fontSize ?? 16,
      bold: false,
      italic: false,
    };
    const nextFont = patch.font ? { ...currentFont, ...patch.font } : currentFont;

    updateOverlayObject(activePageIndex, (selectedListObj as any).id, {
      ...(patch as any),
      font: nextFont,
      // keep legacy fields in sync for render + defaults
      fontSize: nextFont.size,
      color: patch.color ?? (selectedListObj as any).color,
    } as any);
  };

  const allTextItems = (() => {
    if (!doc) return [] as Array<{ pageIndex: number; obj: any }>;
    const items: Array<{ pageIndex: number; obj: any }> = [];
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      for (const o of page.objects ?? []) {
        if (o.type === 'text') items.push({ pageIndex, obj: o });
      }
    }
    items.sort((a, b) => a.pageIndex - b.pageIndex);
    return items;
  })();

  const allListItems = (() => {
    if (!doc) return [] as Array<{ pageIndex: number; obj: any }>;
    const items: Array<{ pageIndex: number; obj: any }> = [];
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      for (const o of page.objects ?? []) {
        if (o.type === 'list') items.push({ pageIndex, obj: o });
      }
    }
    items.sort((a, b) => a.pageIndex - b.pageIndex);
    return items;
  })();

  const allHighlightItems = (() => {
    if (!doc) return [] as Array<{ pageIndex: number; obj: any }>;
    const items: Array<{ pageIndex: number; obj: any }> = [];
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      for (const o of page.objects ?? []) {
        if (o.type === 'highlight') items.push({ pageIndex, obj: o });
      }
    }
    items.sort((a, b) => a.pageIndex - b.pageIndex);
    return items;
  })();

  const allInkItems = (() => {
    if (!doc) return [] as Array<{ pageIndex: number; obj: any }>;
    const items: Array<{ pageIndex: number; obj: any }> = [];
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      for (const o of page.objects ?? []) {
        if (o.type === 'ink') items.push({ pageIndex, obj: o });
      }
    }
    items.sort((a, b) => a.pageIndex - b.pageIndex);
    return items;
  })();

  const allImageItems = (() => {
    if (!doc) return [] as Array<{ pageIndex: number; obj: any }>;
    const items: Array<{ pageIndex: number; obj: any }> = [];
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      for (const o of page.objects ?? []) {
        if (o.type === 'image') items.push({ pageIndex, obj: o });
      }
    }
    items.sort((a, b) => a.pageIndex - b.pageIndex);
    return items;
  })();

  const selectedImage = useMemo(() => {
    if (!doc || !selectedImageId) return null as null | { pageIndex: number; obj: any };
    for (const [pageIndexStr, page] of Object.entries(doc.overlays)) {
      const pageIndex = Number(pageIndexStr);
      if (!Number.isFinite(pageIndex)) continue;
      const hit = (page.objects ?? []).find((o) => o.type === 'image' && o.id === selectedImageId);
      if (hit) return { pageIndex, obj: hit as any };
    }
    return null;
  }, [doc, selectedImageId]);

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const clampCrop = (crop: { l: number; t: number; r: number; b: number }) => {
    // Keep each side within [0, 0.45] and avoid total >= 1.
    const max = 0.45;
    let l = Math.min(max, clamp01(crop.l));
    let r = Math.min(max, clamp01(crop.r));
    let t = Math.min(max, clamp01(crop.t));
    let b = Math.min(max, clamp01(crop.b));

    // Ensure l+r < 0.95 and t+b < 0.95
    const maxSum = 0.95;
    const lr = l + r;
    if (lr > maxSum) {
      const over = lr - maxSum;
      // reduce the side being adjusted least predictably; simplest: reduce both equally
      const half = over / 2;
      l = Math.max(0, l - half);
      r = Math.max(0, r - half);
    }
    const tb = t + b;
    if (tb > maxSum) {
      const over = tb - maxSum;
      const half = over / 2;
      t = Math.max(0, t - half);
      b = Math.max(0, b - half);
    }

    return { l, t, r, b };
  };

  if (tool === 'shape') {
    return (
      <div className="propsPanel">
        <ShapePanel />
      </div>
    );
  }

  return (
    <div className="propsPanel">
      <div className="propsRow">
        <div className="muted">Tool</div>
        <div>{tool}</div>
      </div>

      {tool === 'pages' ? (
        <>
          <div className="propsRow">
            <div className="muted">Pages</div>
            <div>{(selectedPageIndices.length || 1)}</div>
          </div>

          <hr />

          <div className="propsRow">
            <span className="muted">Page size</span>
            <span className="muted">
              {pageSizeSelection?.mixed
                ? 'Mixed'
                : pageSizeSelection?.presetLabel
                  ? `${pageSizeSelection.presetLabel} (${pageSizeSelection.orientation})`
                  : pageSizeSelection
                    ? formatSize(pageSizeSelection.size, pageSizeUnit)
                    : ''}
            </span>
          </div>

          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="iosSelectWrap" style={{ flex: 1, minWidth: 160 }}>
                <select
                  className="iosSelect"
                  value={pageSizePresetId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPageSizePresetId(next);
                    if (next !== 'custom') {
                      const preset = PAGE_SIZE_PRESETS.find((p) => p.id === next);
                      if (preset) {
                        const orientation = preset.widthPoints >= preset.heightPoints ? 'landscape' : 'portrait';
                        setPageSizeOrientation(orientation);
                        const converted = sizeToUnit({ w: preset.widthPoints, h: preset.heightPoints }, pageSizeUnit);
                        const round = (n: number) => (pageSizeUnit === 'pt' ? Math.round(n) : Math.round(n * 10) / 10);
                        setPageSizeW(round(converted.w));
                        setPageSizeH(round(converted.h));
                      }
                    }
                  }}
                >
                  <option value="custom">Custom</option>
                  <optgroup label="ISO">
                    {PAGE_SIZE_PRESETS.filter((p) => p.category === 'ISO').map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="US">
                    {PAGE_SIZE_PRESETS.filter((p) => p.category === 'US').map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="iosSelectWrap" style={{ width: 92 }}>
                <select
                  className="iosSelect"
                  value={pageSizeUnit}
                  onChange={(e) => setPageSizeUnit(e.target.value as PageSizeUnit)}
                  aria-label="Units"
                >
                  <option value="mm">mm</option>
                  <option value="in">in</option>
                  <option value="pt">pt</option>
                </select>
              </div>
            </div>

            <div className="row gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={pageSizeOrientation === 'portrait' ? 'active' : undefined}
                aria-pressed={pageSizeOrientation === 'portrait'}
                onClick={() => {
                  if (pageSizeOrientation === 'portrait') return;
                  setPageSizeOrientation('portrait');
                  if (pageSizePresetId === 'custom') {
                    setPageSizeW(pageSizeH);
                    setPageSizeH(pageSizeW);
                  }
                }}
              >
                Portrait
              </button>
              <button
                type="button"
                className={pageSizeOrientation === 'landscape' ? 'active' : undefined}
                aria-pressed={pageSizeOrientation === 'landscape'}
                onClick={() => {
                  if (pageSizeOrientation === 'landscape') return;
                  setPageSizeOrientation('landscape');
                  if (pageSizePresetId === 'custom') {
                    setPageSizeW(pageSizeH);
                    setPageSizeH(pageSizeW);
                  }
                }}
              >
                Landscape
              </button>

              <label className="row gap" style={{ alignItems: 'center', marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={pageSizeSetAsDefault}
                  onChange={(e) => setPageSizeSetAsDefault(e.target.checked)}
                />
                Set as default
              </label>
            </div>

            {pageSizePresetId === 'custom' ? (
              <div className="row gap" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  value={pageSizeW}
                  onChange={(e) => setPageSizeW(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 120, padding: 8 }}
                  placeholder="Width"
                  aria-label="Page width"
                />
                <span className="muted">×</span>
                <input
                  type="number"
                  value={pageSizeH}
                  onChange={(e) => setPageSizeH(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 120, padding: 8 }}
                  placeholder="Height"
                  aria-label="Page height"
                />
              </div>
            ) : null}

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={() => {
                if (!doc) return;
                const targets = getTargetPages();
                if (targets.length === 0) return;

                let widthPoints: number;
                let heightPoints: number;
                let presetId: string | null = null;
                let sourceSizeType: 'preset' | 'custom' = 'custom';

                if (pageSizePresetId !== 'custom') {
                  const preset = PAGE_SIZE_PRESETS.find((p) => p.id === pageSizePresetId);
                  if (!preset) return;
                  widthPoints = preset.widthPoints;
                  heightPoints = preset.heightPoints;
                  if (pageSizeOrientation === 'landscape') {
                    [widthPoints, heightPoints] = [heightPoints, widthPoints];
                  }
                  presetId = preset.id;
                  sourceSizeType = 'preset';
                } else {
                  const converted = unitToPoints({ w: Number(pageSizeW), h: Number(pageSizeH) }, pageSizeUnit);
                  widthPoints = converted.w;
                  heightPoints = converted.h;

                  if (pageSizeOrientation === 'landscape' && widthPoints < heightPoints) {
                    [widthPoints, heightPoints] = [heightPoints, widthPoints];
                  }
                  if (pageSizeOrientation === 'portrait' && widthPoints > heightPoints) {
                    [widthPoints, heightPoints] = [heightPoints, widthPoints];
                  }
                }

                if (!Number.isFinite(widthPoints) || !Number.isFinite(heightPoints)) return;
                if (widthPoints <= 0 || heightPoints <= 0) return;

                setPageSizeForPages({
                  pageIndices: targets,
                  sizePoints: { widthPoints, heightPoints, presetId },
                  sourceSizeType,
                  setAsDefault: pageSizeSetAsDefault,
                });

                setPageSizeSetAsDefault(false);
              }}
            >
              Apply to {pageSizeSelection?.count ?? (selectedPageIndices.length || 1)}
            </button>

            <div className="muted" style={{ fontSize: 12 }}>
              Default for new blank pages:{' '}
              {doc?.defaultPageSizePoints
                ? formatSize(
                    { w: doc.defaultPageSizePoints.widthPoints, h: doc.defaultPageSizePoints.heightPoints },
                    pageSizeUnit,
                  )
                : formatSize(getDefaultBlankPageSizePoints(), pageSizeUnit)}
            </div>
          </div>

          <div className="row gap" style={{ padding: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={() => {
                if (!doc) return;
                try {
                  const targets = getTargetPages();
                  if (targets.length >= doc.pageCount) {
                    alert('Cannot delete all pages');
                    return;
                  }
                  deletePages(targets);
                  clearPageSelection();
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Delete failed');
                }
              }}
            >
              Delete
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes || (doc?.pageCount ?? 0) < 2}
              className={reorderOpen ? 'active' : ''}
              onClick={() => {
                if (reorderOpen) {
                  closeReorder();
                } else {
                  openReorder();
                }
              }}
            >
              Reorder
            </button>

            {reorderOpen ? (
              <div
                className="propsInlinePanel"
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div className="muted">Drag pages to reorder. Labels refer to the current page numbers.</div>
                <div
                  style={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    border: '1px solid var(--studio-border)',
                    borderRadius: 6,
                    padding: 6,
                    background: 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignContent: 'flex-start',
                  }}
                >
                  {reorderDraft.map((editorIndex, pos) => (
                    <div
                      key={`reorder-${editorIndex}`}
                      draggable
                      onDragStart={(e) => {
                        setReorderDragFrom(pos);
                        try {
                          e.dataTransfer.setData('text/plain', String(pos));
                        } catch {
                          // ignore
                        }
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (reorderDragFrom == null) return;
                        if (reorderDragFrom === pos) return;
                        setReorderDraft((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(reorderDragFrom, 1);
                          next.splice(pos, 0, moved);
                          return next;
                        });
                        setReorderDragFrom(null);
                      }}
                      style={{
                        userSelect: 'none',
                        width: 40,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        border: '1px solid var(--studio-border)',
                        background: 'rgba(255,255,255,0.03)',
                        cursor: 'grab',
                        fontSize: 13,
                        lineHeight: 1.1,
                      }}
                      title="Drag to reorder"
                    >
                      {editorIndex + 1}
                    </div>
                  ))}
                </div>

                <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" onClick={closeReorder}>Cancel</button>
                  <button
                    type="button"
                    disabled={!doc?.basePdfBytes || reorderDraft.length !== (doc?.pageCount ?? 0)}
                    onClick={async () => {
                      if (!doc?.basePdfBytes) return;

                      try {
                        const originalPageOrder = reorderDraft.map((editorIndex) => doc.pageOrder[editorIndex] ?? editorIndex);
                        const bytes = await reorderPdfBytes({
                          basePdfBytes: doc.basePdfBytes,
                          originalPageOrder,
                        });

                        // Reload as a fresh upload: clears overlays/undo/redo/etc via loadPdfFromFile.
                        const name = `${doc.meta.title || 'document'}.pdf`;
                        const file = new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
                        await loadPdfFromFile(file);

                        closeReorder();
                        clearPageSelection();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : 'Reorder failed');
                      }
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={() => rotatePages(getTargetPages(), -90)}
            >
              Rotate ⟲
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={() => rotatePages(getTargetPages(), 90)}
            >
              Rotate ⟳
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              className={cropMode ? 'active' : ''}
              onClick={() => setCropMode(!cropMode)}
            >
              Crop
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes || !cropMode}
              onClick={() => {
                if (!doc) return;
                const targets = getTargetPages();
                for (const idx of targets) {
                  const draft = cropDraftByPage[idx];
                  if (draft) setPageCrop(idx, draft);
                }
                setCropMode(false);
              }}
            >
              Apply Crop
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes || !cropMode}
              onClick={() => {
                if (!doc) return;
                const targets = getTargetPages();
                for (const idx of targets) {
                  setPageCrop(idx, null);
                  clearCropDraft(idx);
                }
              }}
            >
              Reset Crop
            </button>

            <button type="button" disabled={!doc?.basePdfBytes} onClick={() => setMergeOpen(true)}>
              Merge
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              className={mergePlusOpen ? 'active' : ''}
              onClick={() => {
                if (!doc?.basePdfBytes) return;
                setMergePlusOpen(!mergePlusOpen);
              }}
            >
              Merge+
            </button>

            {mergePlusOpen ? (
              <div className="propsInlinePanel" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) => f.type === 'application/pdf');
                    if (files.length) setMergePlusFiles((prev) => [...prev, ...files]);
                    e.currentTarget.value = '';
                  }}
                />

                {mergePlusFiles.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {mergePlusFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                        <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.name}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMergePlusFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">Select one or more PDFs to merge.</div>
                )}

                <button
                  type="button"
                  disabled={!doc?.basePdfBytes || mergePlusFiles.length === 0}
                  onClick={async () => {
                    if (!doc?.basePdfBytes) return;
                    if (mergePlusFiles.length === 0) return;

                    try {
                      const outFile = await mergePlusFilesToFile({
                        files: mergePlusFiles,
                        outputBaseName: doc?.meta.title || 'document',
                      });
                      await loadPdfFromFile(outFile);
                      void logFileOpened(outFile.name, 'local');
                      setMergePlusFiles([]);
                      setMergePlusOpen(false);
                      clearPageSelection();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'Merge+ failed');
                    }
                  }}
                >
                  Merge
                </button>
              </div>
            ) : null}

            <button type="button" disabled={!doc?.basePdfBytes} onClick={() => setSplitOpen(true)}>
              Split
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={async () => {
                if (!doc) return;
                const targets = getTargetPages();
                if (targets.length === 0) return;
                const bytes = await exportPagesFromModel({ doc, pageIndices: targets, stampSettings: exportStamps });
                downloadBytes(bytes, `${doc.meta.title || 'document'}-extract.pdf`, 'application/pdf');
              }}
            >
              Extract
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={async () => {
                if (!doc?.basePdfBytes) return;
                try {
                  const pdf = await getPdfDocument(doc.basePdfBytes);
                  const originalIndex = doc.pageOrder[activePageIndex] ?? activePageIndex;
                  const page = await (pdf as any).getPage(originalIndex + 1);

                  const prefix = `${doc.meta.title || 'document'}-p${activePageIndex + 1}`;
                  const files = await extractImagesFromPage(page, prefix);
                  if (files.length === 0) {
                    alert('no image detected in this page');
                    return;
                  }
                  if (files.length === 1) {
                    downloadBytes(files[0].bytes, files[0].filename, 'image/png');
                    return;
                  }
                  await downloadZipFiles(files, `${prefix}-images.zip`);
                } catch (e) {
                  alert(e instanceof Error ? e.message : 'Extract Image failed');
                }
              }}
            >
              Extract Image
            </button>

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              className={extractPlusOpen ? 'active' : ''}
              onClick={() => {
                if (!doc?.basePdfBytes) return;
                setExtractPlusOpen(!extractPlusOpen);
              }}
            >
              Extract+
            </button>

            {extractPlusOpen ? (
              <div className="propsInlinePanel" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="row gap" style={{ width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={extractPlusSpec}
                    onChange={(e) => setExtractPlusSpec(e.target.value)}
                    placeholder="e.g. 1,3,5 or 3-5"
                    style={{ flex: 1, minWidth: 180, padding: 8 }}
                  />

                  <label className="row gap" style={{ alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={extractPlusCombined}
                      onChange={(e) => setExtractPlusCombined(e.target.checked)}
                    />
                    Combined
                  </label>
                </div>

                <div className="row gap" style={{ width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!doc?.basePdfBytes}
                    onClick={async () => {
                      if (!doc?.basePdfBytes) return;
                      try {
                        const indices = parseExtractPlusPages(extractPlusSpec);
                        if (indices.length === 0) return;

                        if (extractPlusCombined) {
                          const bytes = await exportPagesFromModel({ doc, pageIndices: indices, stampSettings: exportStamps });
                          downloadBytes(bytes, `${doc.meta.title || 'document'}-extractplus.pdf`, 'application/pdf');
                          return;
                        }

                        const files: Array<{ filename: string; bytes: Uint8Array }> = [];
                        for (const idx of indices) {
                          // eslint-disable-next-line no-await-in-loop
                          const bytes = await exportPagesFromModel({ doc, pageIndices: [idx], stampSettings: exportStamps });
                          files.push({ filename: `${doc.meta.title || 'document'}-extractplus-p${idx + 1}.pdf`, bytes });
                        }

                        if (files.length === 1) {
                          downloadBytes(files[0].bytes, files[0].filename, 'application/pdf');
                          return;
                        }

                        await downloadZipFiles(files, `${doc.meta.title || 'document'}-extractplus.zip`);
                      } catch (e) {
                        alert(e instanceof Error ? e.message : 'Extract+ failed');
                      }
                    }}
                  >
                    Download
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={async () => {
                if (!doc?.basePdfBytes) return;
                const afterIndex = getInsertAfterIndex();
                const blank = getDefaultBlankPageSizePoints();
                const size = { w: blank.w, h: blank.h };
                const res = await appendBlankPage({ basePdfBytes: doc.basePdfBytes, size });

                useDocumentStore.setState((s) => {
                  if (!s.doc) return s;
                  const insertAt = Math.min(afterIndex + 1, s.doc.pageCount);
                  const nextOrder = [...s.doc.pageOrder];
                  nextOrder.splice(insertAt, 0, res.newOriginalIndex);

                  const nextSizes = [...s.doc.pageSizes];
                  nextSizes.splice(insertAt, 0, size);

                  const prevPoints = s.doc.pageSizePoints
                    ? [...s.doc.pageSizePoints]
                    : s.doc.pageSizes.map((ps) => ({
                        widthPoints: ps.w,
                        heightPoints: ps.h,
                        sourceSizeType: 'inferred' as const,
                        presetId: null,
                      }));
                  const nextPoints = [...prevPoints];
                  nextPoints.splice(insertAt, 0, {
                    widthPoints: size.w,
                    heightPoints: size.h,
                    sourceSizeType: 'custom',
                    presetId: s.doc.defaultPageSizePoints?.presetId ?? null,
                  });

                  const nextRot = [...s.doc.pageRotation];
                  nextRot.splice(insertAt, 0, 0);

                  const nextCrop = s.doc.pageCrop ? [...s.doc.pageCrop] : Array.from({ length: s.doc.pageCount }, () => null);
                  nextCrop.splice(insertAt, 0, null);

                  const nextOverlays: any = {};
                  for (const [k, v] of Object.entries(s.doc.overlays)) {
                    const idx = Number(k);
                    if (idx < insertAt) nextOverlays[idx] = v;
                    else nextOverlays[idx + 1] = v;
                  }

                  return {
                    ...s,
                    doc: {
                      ...s.doc,
                      basePdfBytes: res.bytes,
                      pageCount: s.doc.pageCount + 1,
                      pageOrder: nextOrder,
                      pageSizes: nextSizes,
                      pageSizePoints: nextPoints,
                      defaultPageSizePoints:
                        s.doc.defaultPageSizePoints ??
                        ({ widthPoints: size.w, heightPoints: size.h, presetId: null } as any),
                      pageRotation: nextRot,
                      pageCrop: nextCrop,
                      overlays: nextOverlays,
                    },
                    activePageIndex: insertAt,
                    isDirty: true,
                  };
                });
                clearPageSelection();
                setActivePage(afterIndex + 1);
              }}
            >
              Insert Blank
            </button>


            <input
              ref={insertImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !doc?.basePdfBytes) return;
                const buf = new Uint8Array(await file.arrayBuffer());
                const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const afterIndex = getInsertAfterIndex();
                const baseSize = getEffectivePageSizePoints(activePageIndex);
                const targetSize = { w: baseSize.w, h: baseSize.h };
                const res = await appendImagePage({ basePdfBytes: doc.basePdfBytes, imageBytes: buf, mime, targetSize });
                const insertedMatch = findPresetForSize({ w: res.size.w, h: res.size.h });

                useDocumentStore.setState((s) => {
                  if (!s.doc) return s;
                  const insertAt = Math.min(afterIndex + 1, s.doc.pageCount);
                  const nextOrder = [...s.doc.pageOrder];
                  nextOrder.splice(insertAt, 0, res.newOriginalIndex);

                  const nextSizes = [...s.doc.pageSizes];
                  nextSizes.splice(insertAt, 0, res.size);

                  const prevPoints = s.doc.pageSizePoints
                    ? [...s.doc.pageSizePoints]
                    : s.doc.pageSizes.map((ps) => ({
                        widthPoints: ps.w,
                        heightPoints: ps.h,
                        sourceSizeType: 'inferred' as const,
                        presetId: null,
                      }));
                  const nextPoints = [...prevPoints];
                  nextPoints.splice(insertAt, 0, {
                    widthPoints: res.size.w,
                    heightPoints: res.size.h,
                    sourceSizeType: 'image',
                    presetId: insertedMatch?.preset.id ?? null,
                  });

                  const nextRot = [...s.doc.pageRotation];
                  nextRot.splice(insertAt, 0, 0);

                  const nextCrop = s.doc.pageCrop ? [...s.doc.pageCrop] : Array.from({ length: s.doc.pageCount }, () => null);
                  nextCrop.splice(insertAt, 0, null);

                  const nextOverlays: any = {};
                  for (const [k, v] of Object.entries(s.doc.overlays)) {
                    const idx = Number(k);
                    if (idx < insertAt) nextOverlays[idx] = v;
                    else nextOverlays[idx + 1] = v;
                  }

                  return {
                    ...s,
                    doc: {
                      ...s.doc,
                      basePdfBytes: res.bytes,
                      pageCount: s.doc.pageCount + 1,
                      pageOrder: nextOrder,
                      pageSizes: nextSizes,
                      pageSizePoints: nextPoints,
                      pageRotation: nextRot,
                      pageCrop: nextCrop,
                      overlays: nextOverlays,
                    },
                    activePageIndex: insertAt,
                    isDirty: true,
                  };
                });

                clearPageSelection();
                setActivePage(afterIndex + 1);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              disabled={!doc?.basePdfBytes}
              onClick={() => insertImageInputRef.current?.click()}
            >
              Insert Image
            </button>
          </div>

          <MergePdfModal
            isOpen={mergeOpen}
            onClose={() => setMergeOpen(false)}
            onMerge={async (file) => {
              if (!doc?.basePdfBytes) throw new Error('No PDF loaded');
              const otherBytes = new Uint8Array(await file.arrayBuffer());
              const merged = await mergePdfBytes({ basePdfBytes: doc.basePdfBytes, otherPdfBytes: otherBytes });
                const appendedPoints = merged.appendedPageSizes.map((s) => {
                  const match = findPresetForSize({ w: s.w, h: s.h });
                  return {
                    widthPoints: s.w,
                    heightPoints: s.h,
                    sourceSizeType: match ? ('preset' as const) : ('inferred' as const),
                    presetId: match?.preset.id ?? null,
                  };
                });

              const insertAfter = getInsertAfterIndex();
              const insertAt = Math.min(insertAfter + 1, doc.pageCount);

              useDocumentStore.setState((s) => {
                if (!s.doc) return s;
                const oldCount = s.doc.pageCount;
                const addedCount = merged.appendedPageSizes.length;
                const newOriginalStart = merged.newOriginalStart;

                const nextOrder = [...s.doc.pageOrder];
                for (let i = 0; i < addedCount; i++) {
                  nextOrder.splice(insertAt + i, 0, newOriginalStart + i);
                }

                const nextSizes = [...s.doc.pageSizes];
                nextSizes.splice(insertAt, 0, ...merged.appendedPageSizes);

                const prevPoints = s.doc.pageSizePoints
                  ? [...s.doc.pageSizePoints]
                  : s.doc.pageSizes.map((ps) => ({
                      widthPoints: ps.w,
                      heightPoints: ps.h,
                      sourceSizeType: 'inferred' as const,
                      presetId: null,
                    }));
                const nextPoints = [...prevPoints];
                nextPoints.splice(insertAt, 0, ...appendedPoints);

                const nextRot = [...s.doc.pageRotation];
                nextRot.splice(insertAt, 0, ...Array.from({ length: addedCount }, () => 0 as any));

                const nextCrop = s.doc.pageCrop ? [...s.doc.pageCrop] : Array.from({ length: s.doc.pageCount }, () => null);
                nextCrop.splice(insertAt, 0, ...Array.from({ length: addedCount }, () => null));

                const nextOverlays: any = {};
                for (const [k, v] of Object.entries(s.doc.overlays)) {
                  const idx = Number(k);
                  if (idx < insertAt) nextOverlays[idx] = v;
                  else nextOverlays[idx + addedCount] = v;
                }

                return {
                  ...s,
                  doc: {
                    ...s.doc,
                    basePdfBytes: merged.bytes,
                    pageCount: oldCount + addedCount,
                    pageOrder: nextOrder,
                    pageSizes: nextSizes,
                    pageSizePoints: nextPoints,
                    pageRotation: nextRot,
                    pageCrop: nextCrop,
                    overlays: nextOverlays,
                  },
                  isDirty: true,
                };
              });
            }}
          />

          <SplitModal
            isOpen={splitOpen}
            onClose={() => setSplitOpen(false)}
            onSplit={async (rangesText) => {
              if (!doc) throw new Error('No document');
              const res = await splitPdfByRanges({ doc, rangesText, stampSettings: exportStamps });
              if ('error' in res) {
                alert(res.error);
                return;
              }
              for (const f of res.files) downloadBytes(f.bytes, f.filename, 'application/pdf');
            }}
          />

          <hr />
        </>
      ) : null}

      {tool === 'pages' ? null : canEditPaint ? (
        <>
          <div className="propsRow">
            <span className="muted">Color</span>
            <div className="row gap">
              <input
                type="color"
                value={toolProps.color}
                onChange={(e) => setToolProp('color', e.target.value)}
              />
              <button type="button" onClick={() => setToolProp('color', '#e11d48')}>Reset</button>
            </div>
          </div>

          {tool !== 'text' ? (
            <div className="propsRow">
              <span className="muted">Opacity</span>
              <div className="row gap">
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={toolProps.opacity}
                  onChange={(e) => setToolProp('opacity', Number(e.target.value))}
                />
                <button type="button" onClick={() => setToolProp('opacity', 0.35)}>Reset</button>
              </div>
            </div>
          ) : null}

          {tool === 'ink' ? (
            <div className="propsRow">
              <span className="muted">Width</span>
              <div className="row gap">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={toolProps.width}
                  onChange={(e) => setToolProp('width', Number(e.target.value))}
                />
                <button type="button" onClick={() => setToolProp('width', 2)}>Reset</button>
              </div>
            </div>
          ) : null}

          {tool === 'text' ? (
            <div className="propsRow">
              <span className="muted">Font size</span>
              <div className="row gap">
                <input
                  type="range"
                  min={10}
                  max={40}
                  step={1}
                  value={toolProps.fontSize}
                  onChange={(e) => setToolProp('fontSize', Number(e.target.value))}
                />
                <button type="button" onClick={() => setToolProp('fontSize', 14)}>Reset</button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        tool === 'image' ? null : (
          <div className="muted" style={{ padding: 10 }}>
            Select a drawing tool to edit properties.
          </div>
        )
      )}

      {tool === 'text' && selectedTextObj ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Text</div>
            <div>Selected</div>
          </div>
          <div style={{ padding: 10 }}>
            <TextToolbar obj={selectedTextObj as any} onPatch={applyTextPatch} />
          </div>
        </>
      ) : null}

      {tool === 'list' && selectedListObj ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">List</div>
            <div>Selected</div>
          </div>
          <div style={{ padding: 10 }}>
            <ListToolbar obj={selectedListObj as any} onPatch={applyListPatch} />
          </div>
        </>
      ) : null}

      {tool === 'link' || selectedLinkId ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Link</div>
            <div>{selectedLink ? 'Selected' : tool === 'link' ? 'Draw to create' : 'None'}</div>
          </div>

          {selectedLink ? (
            <div style={{ padding: 10 }}>
              <div className="propsRow" style={{ padding: 0, marginBottom: 10 }}>
                <span className="muted">Type</span>
                <div className="row gap">
                  <label className="row gap" style={{ gap: 6 }}>
                    <input
                      type="radio"
                      name="linkKind"
                      checked={linkKindDraft === 'external'}
                      onChange={() => setLinkKindDraft('external')}
                    />
                    External
                  </label>
                  <label className="row gap" style={{ gap: 6 }}>
                    <input
                      type="radio"
                      name="linkKind"
                      checked={linkKindDraft === 'internal'}
                      onChange={() => setLinkKindDraft('internal')}
                    />
                    Internal
                  </label>
                </div>
              </div>

              {linkKindDraft === 'external' ? (
                <>
                  <div className="propsRow" style={{ padding: 0, marginBottom: 10 }}>
                    <span className="muted">URL</span>
                    <input
                      type="text"
                      value={linkUrlDraft}
                      onChange={(e) => setLinkUrlDraft(e.target.value)}
                      placeholder="https://example.com"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div className="propsRow" style={{ padding: 0, marginBottom: 10 }}>
                    <span className="muted">Export</span>
                    <label className="row gap" style={{ gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={linkShowLabelDraft}
                        onChange={(e) => setLinkShowLabelDraft(e.target.checked)}
                      />
                      Show URL text in PDF
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="propsRow" style={{ padding: 0, marginBottom: 10 }}>
                    <span className="muted">Page</span>
                    <select
                      value={String(linkInternalPageDraft)}
                      onChange={(e) => setLinkInternalPageDraft(Number(e.target.value) || 0)}
                      style={{ width: '100%' }}
                    >
                      {(doc ? Array.from({ length: doc.pageCount }, (_, i) => i) : []).map((i) => (
                        <option key={i} value={String(i)}>
                          Page {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="propsRow" style={{ padding: 0, marginBottom: 10 }}>
                    <span className="muted">Dest (optional)</span>
                    <div className="row gap" style={{ alignItems: 'center' }}>
                      <input
                        type="number"
                        value={linkInternalXDraft}
                        onChange={(e) => setLinkInternalXDraft(e.target.value)}
                        placeholder="x"
                        style={{ width: 80 }}
                      />
                      <input
                        type="number"
                        value={linkInternalYDraft}
                        onChange={(e) => setLinkInternalYDraft(e.target.value)}
                        placeholder="y"
                        style={{ width: 80 }}
                      />
                      <input
                        type="number"
                        value={linkInternalZoomDraft}
                        onChange={(e) => setLinkInternalZoomDraft(e.target.value)}
                        placeholder="zoom"
                        style={{ width: 90 }}
                      />
                    </div>
                  </div>

                  <div className="row gap" style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = useDocumentStore.getState().selectedLinkId;
                        if (!cur) return;
                        const destPageIndex = linkInternalPageDraft;
                        setLinkDestPick({ linkId: cur, destPageIndex, returnTool: tool });
                        setActivePage(destPageIndex);
                        setTool('pages');
                      }}
                      title="Click a point on the destination page to set x/y"
                    >
                      Pick destination on page
                    </button>

                    {linkDestPick ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLinkDestPick(null);
                          setTool(linkDestPick.returnTool);
                        }}
                      >
                        Cancel pick
                      </button>
                    ) : null}
                  </div>
                </>
              )}

              <div className="row gap" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => {
                    const cur = useDocumentStore.getState().selectedLinkId;
                    if (!cur) return;
                    if (linkKindDraft === 'external') {
                      updateLinkMark(cur, {
                        target: { kind: 'external', url: normalizeExternalUrl(linkUrlDraft) },
                        showLabel: linkShowLabelDraft,
                      } as any);
                      return;
                    }
                    const x = linkInternalXDraft.trim() ? Number(linkInternalXDraft) : undefined;
                    const y = linkInternalYDraft.trim() ? Number(linkInternalYDraft) : undefined;
                    const zoom = linkInternalZoomDraft.trim() ? Number(linkInternalZoomDraft) : undefined;

                    updateLinkMark(cur, {
                      target: {
                        kind: 'internal',
                        pageIndex: linkInternalPageDraft,
                        ...(Number.isFinite(x) ? { x } : null),
                        ...(Number.isFinite(y) ? { y } : null),
                        ...(Number.isFinite(zoom) ? { zoom } : null),
                      },
                    } as any);
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cur = useDocumentStore.getState().selectedLinkId;
                    if (!cur) return;
                    removeLinkMark(cur);
                    setSelectedLinkId(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ padding: 10 }}>
              Use the Link tool to drag a rectangle on the page.
            </div>
          )}

          <div className="propsRow">
            <div className="muted">Links on page</div>
            <div>{doc ? listLinkMarks(activePageIndex).length : 0}</div>
          </div>

          <div className="textList">
            {!doc || listLinkMarks(activePageIndex).length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No links on this page.
              </div>
            ) : (
              listLinkMarks(activePageIndex).map((m) => {
                const t = (m as any).target;
                const label =
                  t?.kind === 'internal'
                    ? `Internal → Page ${(Number(t.pageIndex) || 0) + 1}`
                    : String(t?.url || '(empty URL)');
                const isActive = m.id === selectedLinkId;
                return (
                  <div key={m.id} className="textListRow">
                    <button
                      type="button"
                      className={isActive ? 'textListItem active' : 'textListItem'}
                      onClick={() => {
                        setActivePage(m.pageIndex);
                        setSelectedLinkId(m.id);
                      }}
                      title={label}
                    >
                      <div className="textListItemTitle">
                        {label.length > 36 ? `${label.slice(0, 36)}…` : label}
                      </div>
                      <div className="textListItemMeta">Page {m.pageIndex + 1}</div>
                    </button>

                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLinkMark(m.id);
                          if (useDocumentStore.getState().selectedLinkId === m.id) {
                            setSelectedLinkId(null);
                          }
                        }}
                        title="Delete"
                        aria-label="Delete link"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'text' ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Texts</div>
            <div>{allTextItems.length}</div>
          </div>
          <div className="textList">
            {allTextItems.length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No text boxes yet. Click on the page to add one.
              </div>
            ) : (
              allTextItems.map(({ pageIndex, obj }) => {
                const preview = String(obj.text ?? '').trim().split('\n')[0] || '(empty)';
                const isActive = obj.id === selectedTextId;
                return (
                  <div key={`${pageIndex}:${obj.id}`} className="textListRow">
                    <button
                      type="button"
                      className={isActive ? 'textListItem active' : 'textListItem'}
                      onClick={() => {
                        const currentDoc = useDocumentStore.getState().doc;
                        const objects = currentDoc?.overlays[pageIndex]?.objects ?? [];
                        const idx = objects.findIndex((o) => o.type === 'text' && o.id === obj.id);
                        if (idx > 0) {
                          const toRemove: string[] = [];
                          for (let i = 0; i < idx; i++) {
                            const o = objects[i];
                            if (o.type !== 'text') continue;
                            const t = String((o as any).text ?? '').trim();
                            if (t.length === 0) toRemove.push(o.id);
                          }
                          for (const id of toRemove) removeOverlayObject(pageIndex, id);
                        }

                        setActivePage(pageIndex);
                        setSelectedTextId(obj.id);
                        setEditingTextId(null);
                      }}
                      title={preview}
                    >
                      <div className="textListItemTitle">
                        {preview.length > 36 ? `${preview.slice(0, 36)}…` : preview}
                      </div>
                      <div className="textListItemMeta">Page {pageIndex + 1}</div>
                    </button>


                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateOverlayObject(pageIndex, obj.id);
                        }}
                        title="Copy"
                        aria-label="Copy text box"
                      >
                        <IconCopy />
                      </button>

                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlayObject(pageIndex, obj.id);
                          if (useUiStore.getState().selectedTextId === obj.id) {
                            setSelectedTextId(null);
                            setEditingTextId(null);
                          }
                        }}
                        title="Delete"
                        aria-label="Delete text box"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'list' ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Lists</div>
            <div>{allListItems.length}</div>
          </div>
          <div className="textList">
            {allListItems.length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No lists yet. Click on the page to add one.
              </div>
            ) : (
              allListItems.map(({ pageIndex, obj }, idx) => {
                const rawItems = (obj.items ?? []) as Array<{ text?: string }>;
                const firstNonEmpty = rawItems.map((it) => String(it.text ?? '').trim()).find((t) => t.length > 0);
                const preview = firstNonEmpty || `(List ${idx + 1})`;
                const isActive = obj.id === selectedListId;
                return (
                  <div key={`${pageIndex}:${obj.id}`} className="textListRow">
                    <button
                      type="button"
                      className={isActive ? 'textListItem active' : 'textListItem'}
                      onClick={() => {
                        setActivePage(pageIndex);
                        setSelectedListId(obj.id);
                        setEditingListId(null);

                        // Keep selection unambiguous.
                        setSelectedTextId(null);
                        setEditingTextId(null);
                        setSelectedImageId(null);
                      }}
                      title={preview}
                    >
                      <div className="textListItemTitle">
                        {preview.length > 36 ? `${preview.slice(0, 36)}…` : preview}
                      </div>
                      <div className="textListItemMeta">Page {pageIndex + 1}</div>
                    </button>


                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateOverlayObject(pageIndex, obj.id);
                        }}
                        title="Copy"
                        aria-label="Copy list"
                      >
                        <IconCopy />
                      </button>

                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlayObject(pageIndex, obj.id);
                          if (useUiStore.getState().selectedListId === obj.id) {
                            setSelectedListId(null);
                            setEditingListId(null);
                          }
                        }}
                        title="Delete"
                        aria-label="Delete list"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'highlight' ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Highlights</div>
            <div>{allHighlightItems.length}</div>
          </div>
          <div className="textList">
            {allHighlightItems.length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No highlights yet. Drag on the page to add one.
              </div>
            ) : (
              allHighlightItems.map(({ pageIndex, obj }, idx) => {
                const label = `Highlight ${idx + 1}`;
                return (
                  <div key={`${pageIndex}:${obj.id}`} className="textListRow">
                    <button
                      type="button"
                      className="textListItem"
                      onClick={() => {
                        setActivePage(pageIndex);
                      }}
                      title={`Page ${pageIndex + 1}`}
                    >
                      <div className="textListItemTitle">{label}</div>
                      <div className="textListItemMeta">Page {pageIndex + 1}</div>
                    </button>


                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateOverlayObject(pageIndex, obj.id);
                        }}
                        title="Copy"
                        aria-label="Copy highlight"
                      >
                        <IconCopy />
                      </button>

                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlayObject(pageIndex, obj.id);
                        }}
                        title="Delete"
                        aria-label="Delete highlight"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'ink' ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Inks</div>
            <div>{allInkItems.length}</div>
          </div>
          <div className="textList">
            {allInkItems.length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No ink yet. Draw on the page to add one.
              </div>
            ) : (
              allInkItems.map(({ pageIndex, obj }, idx) => {
                const label = `Ink ${idx + 1}`;
                return (
                  <div key={`${pageIndex}:${obj.id}`} className="textListRow">
                    <button
                      type="button"
                      className="textListItem"
                      onClick={() => {
                        setActivePage(pageIndex);
                      }}
                      title={`Page ${pageIndex + 1}`}
                    >
                      <div className="textListItemTitle">{label}</div>
                      <div className="textListItemMeta">Page {pageIndex + 1}</div>
                    </button>


                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateOverlayObject(pageIndex, obj.id);
                        }}
                        title="Copy"
                        aria-label="Copy ink"
                      >
                        <IconCopy />
                      </button>

                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlayObject(pageIndex, obj.id);
                        }}
                        title="Delete"
                        aria-label="Delete ink"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'image' ? (
        <>
          <hr />
          <div className="propsRow">
            <div className="muted">Images</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    setFilePickerOpen(true);
                    setStatus('Picker: open click');

                    // Prefer File System Access API when available (more reliable than hidden <input> in some setups).
                    try {
                      const w = window as any;
                      if (typeof w.showOpenFilePicker === 'function') {
                        setStatus('Picker: showOpenFilePicker');
                        const handles = await w.showOpenFilePicker({
                          multiple: false,
                          types: [
                            {
                              description: 'Images',
                              accept: {
                                'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
                              },
                            },
                          ],
                        });
                        const handle = handles?.[0];
                        if (!handle) {
                          setStatus('Picker: cancelled');
                          setFilePickerOpen(false);
                          return;
                        }
                        const file = await handle.getFile();
                        await handlePickedImageFile(file);
                        setFilePickerOpen(false);
                        return;
                      }
                    } catch {
                      // fall back to <input>
                      setStatus('Picker: showOpenFilePicker failed; fallback');
                    } finally {
                      // Keep filePickerOpen true until focus returns / change fires.
                    }

                    imageInputRef.current?.click();
                  })();
                }}
              >
                +
              </button>
            </div>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            onClick={() => setStatus('Picker: input clicked')}
            onInput={() => setStatus('Picker: input event')}
            onChange={async (e) => {
              setFilePickerOpen(false);
              setStatus('Picker: change fired');

              const file = e.target.files?.[0];
              // allow selecting same file again
              e.currentTarget.value = '';
              if (!file) {
                setStatus('Picker: cancelled');
                return;
              }
              await handlePickedImageFile(file);
            }}
          />

          {selectedImage ? (
            <>
              <hr />
              <div className="propsRow">
                <span className="muted">Shape Masks</span>
                <span />
              </div>
              <div style={{ padding: 10 }}>
                <ImageMaskPicker
                  selectedImageObj={selectedImage.obj}
                  currentMask={(selectedImage.obj.mask ?? { type: 'none' }) as any}
                  onPatch={(patch) => {
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, patch as any);
                  }}
                />
              </div>

              <hr />
              <div className="propsRow">
                <span className="muted">Transforms</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedImage?.obj?.id) return;
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                      transform: { flipX: false, flipY: false, skewX: 0, skewY: 0 },
                    } as any);
                  }}
                >
                  Reset
                </button>
              </div>

              {(() => {
                const current = selectedImage.obj.transform ?? { flipX: false, flipY: false, skewX: 0, skewY: 0 };
                const patchTransform = (patch: Partial<typeof current>) => {
                  updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                    transform: { ...current, ...patch },
                  } as any);
                };

                return (
                  <>
                    <div className="propsRow">
                      <span className="muted">Flip</span>
                      <div className="row gap">
                        <button
                          type="button"
                          className={current.flipX ? 'active' : undefined}
                          aria-pressed={Boolean(current.flipX)}
                          onClick={() => patchTransform({ flipX: !current.flipX })}
                        >
                          Horizontal
                        </button>
                        <button
                          type="button"
                          className={current.flipY ? 'active' : undefined}
                          aria-pressed={Boolean(current.flipY)}
                          onClick={() => patchTransform({ flipY: !current.flipY })}
                        >
                          Vertical
                        </button>
                      </div>
                    </div>

                    <div className="propsRow">
                      <span className="muted">Skew X</span>
                      <div className="row gap">
                        <span>{Math.round(Number(current.skewX ?? 0))}°</span>
                        <button type="button" onClick={() => patchTransform({ skewX: 0 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={Number(current.skewX ?? 0)}
                        onChange={(e) => patchTransform({ skewX: Number(e.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Skew Y</span>
                      <div className="row gap">
                        <span>{Math.round(Number(current.skewY ?? 0))}°</span>
                        <button type="button" onClick={() => patchTransform({ skewY: 0 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={Number(current.skewY ?? 0)}
                        onChange={(e) => patchTransform({ skewY: Number(e.target.value) })}
                      />
                    </div>
                  </>
                );
              })()}

              {(() => {
                const currentFilters = selectedImage.obj.filters ?? {
                  brightness: 1,
                  contrast: selectedImage.obj.contrast ?? 1,
                  saturation: 1,
                  grayscale: 0,
                  sepia: 0,
                  invert: 0,
                };

                const patchFilters = (patch: Partial<typeof currentFilters>) => {
                  updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                    filters: { ...currentFilters, ...patch },
                  } as any);
                };

                return (
                  <>
                    <div className="propsRow">
                      <span className="muted">Brightness</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.brightness ?? 1) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ brightness: 1 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={currentFilters.brightness ?? 1}
                        onChange={(ev) => patchFilters({ brightness: Number(ev.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Contrast</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.contrast ?? 1) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ contrast: 1 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={currentFilters.contrast ?? 1}
                        onChange={(ev) => patchFilters({ contrast: Number(ev.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Saturation</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.saturation ?? 1) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ saturation: 1 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={0.05}
                        value={currentFilters.saturation ?? 1}
                        onChange={(ev) => patchFilters({ saturation: Number(ev.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Grayscale</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.grayscale ?? 0) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ grayscale: 0 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={currentFilters.grayscale ?? 0}
                        onChange={(ev) => patchFilters({ grayscale: Number(ev.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Sepia</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.sepia ?? 0) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ sepia: 0 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={currentFilters.sepia ?? 0}
                        onChange={(ev) => patchFilters({ sepia: Number(ev.target.value) })}
                      />
                    </div>

                    <div className="propsRow">
                      <span className="muted">Invert</span>
                      <div className="row gap">
                        <span>{Math.round((currentFilters.invert ?? 0) * 100)}%</span>
                        <button type="button" onClick={() => patchFilters({ invert: 0 })}>Reset</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={currentFilters.invert ?? 0}
                        onChange={(ev) => patchFilters({ invert: Number(ev.target.value) })}
                      />
                    </div>
                  </>
                );
              })()}

              <div className="propsRow">
                <span className="muted">Opacity</span>
                <div className="row gap">
                  <span>{Math.round(((selectedImage.obj.opacity ?? 1) * 100))}%</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedImage?.obj?.id) return;
                      updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                        opacity: 1,
                      } as any);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div style={{ padding: 10 }}>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={selectedImage.obj.opacity ?? 1}
                  onChange={(ev) => {
                    if (!selectedImage?.obj?.id) return;
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                      opacity: Number(ev.target.value),
                    } as any);
                  }}
                />
              </div>

              <div className="propsRow">
                <span className="muted">Border radius</span>
                <div className="row gap">
                  <span>{Math.round(selectedImage.obj.borderRadius ?? 0)}px</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedImage?.obj?.id) return;
                      updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                        borderRadius: 0,
                      } as any);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div style={{ padding: 10 }}>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={selectedImage.obj.borderRadius ?? 0}
                  onChange={(ev) => {
                    if (!selectedImage?.obj?.id) return;
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                      borderRadius: Number(ev.target.value),
                    } as any);
                  }}
                />
              </div>

              <div className="propsRow">
                <span className="muted">Crop</span>
                <button
                  type="button"
                  onClick={() => {
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, {
                      crop: { l: 0, t: 0, r: 0, b: 0 },
                    } as any);
                  }}
                >
                  Reset
                </button>
              </div>
              <div style={{ padding: 10, display: 'grid', gap: 10 }}>
                {(() => {
                  const current = selectedImage.obj.crop ?? { l: 0, t: 0, r: 0, b: 0 };
                  const setCrop = (patch: Partial<typeof current>) => {
                    const next = clampCrop({ ...current, ...patch });
                    updateOverlayObject(selectedImage.pageIndex, selectedImage.obj.id, { crop: next } as any);
                  };
                  return (
                    <>
                      <div className="propsRow" style={{ padding: 0 }}>
                        <span className="muted">Left</span>
                        <div className="row gap">
                          <input
                            type="range"
                            min={0}
                            max={0.45}
                            step={0.01}
                            value={current.l}
                            onChange={(e) => setCrop({ l: Number(e.target.value) })}
                          />
                          <button type="button" onClick={() => setCrop({ l: 0 })}>Reset</button>
                        </div>
                      </div>
                      <div className="propsRow" style={{ padding: 0 }}>
                        <span className="muted">Top</span>
                        <div className="row gap">
                          <input
                            type="range"
                            min={0}
                            max={0.45}
                            step={0.01}
                            value={current.t}
                            onChange={(e) => setCrop({ t: Number(e.target.value) })}
                          />
                          <button type="button" onClick={() => setCrop({ t: 0 })}>Reset</button>
                        </div>
                      </div>
                      <div className="propsRow" style={{ padding: 0 }}>
                        <span className="muted">Right</span>
                        <div className="row gap">
                          <input
                            type="range"
                            min={0}
                            max={0.45}
                            step={0.01}
                            value={current.r}
                            onChange={(e) => setCrop({ r: Number(e.target.value) })}
                          />
                          <button type="button" onClick={() => setCrop({ r: 0 })}>Reset</button>
                        </div>
                      </div>
                      <div className="propsRow" style={{ padding: 0 }}>
                        <span className="muted">Bottom</span>
                        <div className="row gap">
                          <input
                            type="range"
                            min={0}
                            max={0.45}
                            step={0.01}
                            value={current.b}
                            onChange={(e) => setCrop({ b: Number(e.target.value) })}
                          />
                          <button type="button" onClick={() => setCrop({ b: 0 })}>Reset</button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          ) : null}

          <div className="textList">
            {allImageItems.length === 0 ? (
              <div className="muted" style={{ padding: 10 }}>
                No images yet. Click + to add one.
              </div>
            ) : (
              allImageItems.map(({ pageIndex, obj }, idx) => {
                const label = obj.name ? String(obj.name) : `Image ${idx + 1}`;
                const isActive = obj.id === selectedImageId;
                return (
                  <div key={`${pageIndex}:${obj.id}`} className="textListRow">
                    <button
                      type="button"
                      className={isActive ? 'textListItem active' : 'textListItem'}
                      onClick={() => {
                        setActivePage(pageIndex);
                        setSelectedImageId(obj.id);
                      }}
                      title={label}
                    >
                      <div className="textListItemTitle">
                        {label.length > 36 ? `${label.slice(0, 36)}…` : label}
                      </div>
                      <div className="textListItemMeta">Page {pageIndex + 1}</div>
                    </button>


                    <div className="textListActions">
                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          duplicateOverlayObject(pageIndex, obj.id);
                        }}
                        title="Copy"
                        aria-label="Copy image"
                      >
                        <IconCopy />
                      </button>

                      <button
                        type="button"
                        className="textListDelete"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          removeOverlayObject(pageIndex, obj.id);
                          if (useUiStore.getState().selectedImageId === obj.id) {
                            setSelectedImageId(null);
                          }
                        }}
                        title="Delete"
                        aria-label="Delete image"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {tool === 'pages' ? (
        <>
          <hr />

          <div className="propsRow">
            <span className="muted">Export stamps</span>
            <span />
          </div>
          <WatermarkPageNumbersPanel />
        </>
      ) : null}
    </div>
  );
}
