import { create } from 'zustand';
import { PDFDocument, degrees } from 'pdf-lib';
import type {
  LinkMark,
  LinkRect,
  LinkTarget,
  OverlayObject,
  PageBackgroundObj,
  PageBorderObj,
  PageCrop,
  PageRotation,
  PdfDocModel,
  Op,
  ShapeObj,
} from './types';
import { createId } from '../util/ids';
import { getPageViewportSize } from '../pdf/pdfjs';
import { getPdfDocument } from '../pdf/render';
import { applyOp, invertOp } from './ops';
import { findPresetForSize } from '../util/pageSizes';

type StatusFlags = {
  loading: boolean;
  error: string | null;
};

type DocumentState = {
  doc: PdfDocModel | null;
  activePageIndex: number;
  zoom: number;
  pan: { x: number; y: number };
  isDirty: boolean;
  status: StatusFlags;

  selectedLinkId: string | null;

  clearDoc: () => void;

  newDoc: () => Promise<void>;
  loadPdfFromFile: (file: File) => Promise<void>;

  setDocTitle: (title: string) => void;

  setActivePage: (index: number) => void;
  reorderPages: (from: number, to: number) => void;
  rotatePage: (index: number, rotation: PageRotation) => void;
  deletePage: (index: number) => void;

  setPageCrop: (index: number, crop: PageCrop | null) => void;
  deletePages: (indices: number[]) => void;
  rotatePages: (indices: number[], delta: -90 | 90) => void;

  setPageSizeForPages: (params: {
    pageIndices: number[];
    sizePoints: { widthPoints: number; heightPoints: number; presetId?: string | null };
    sourceSizeType?: NonNullable<PdfDocModel['pageSizePoints']>[number]['sourceSizeType'];
    setAsDefault?: boolean;
  }) => void;

  addOverlayObject: (pageIndex: number, obj: OverlayObject) => void;
  updateOverlayObject: (pageIndex: number, objId: string, patch: Partial<OverlayObject>) => void;
  removeOverlayObject: (pageIndex: number, objId: string) => void;
  duplicateOverlayObject: (pageIndex: number, objId: string) => void;

  addLinkMark: (pageIndex: number, rect: LinkRect, target: LinkTarget) => LinkMark | null;
  updateLinkMark: (id: string, patch: Partial<Omit<LinkMark, 'id'>>) => void;
  removeLinkMark: (id: string) => void;
  setSelectedLinkId: (id: string | null) => void;
  getSelectedLink: () => LinkMark | null;
  listLinkMarks: (pageIndex: number) => LinkMark[];
  hitTestLink: (pageIndex: number, p: { x: number; y: number }) => LinkMark | null;

  setPageBorder: (pageIndex: number, border: Omit<PageBorderObj, 'id' | 'type'> | null) => void;
  setPageBackground: (pageIndex: number, bg: Omit<PageBackgroundObj, 'id' | 'type'> | null) => void;

  addShape: (pageIndex: number, shape: ShapeObj) => void;
  patchShape: (pageIndex: number, shapeId: string, patch: Partial<ShapeObj>) => void;
  removeShape: (pageIndex: number, shapeId: string) => void;
  reorderShapeLayer: (
    pageIndex: number,
    shapeId: string,
    direction: 'forward' | 'backward' | 'front' | 'back',
  ) => void;

  pushOp: (op: Op) => void;
  undo: () => void;
  redo: () => void;
};

function cloneOverlayObjectForDuplicate(obj: OverlayObject): OverlayObject {
  if (obj.type === 'text') {
    return {
      ...(obj as any),
      id: createId('txt'),
      rect: { ...(obj as any).rect },
      border: (obj as any).border ? { ...(obj as any).border } : undefined,
      font: (obj as any).font ? { ...(obj as any).font } : undefined,
    } as any;
  }

  if (obj.type === 'list') {
    const items = ((obj as any).items ?? []) as Array<any>;
    return {
      ...(obj as any),
      id: createId('lst'),
      rect: { ...(obj as any).rect },
      items: items.map((it) => ({ ...it, id: createId('li') })),
      font: (obj as any).font ? { ...(obj as any).font } : undefined,
    } as any;
  }

  if (obj.type === 'ink') {
    const pts = ((obj as any).points ?? []) as Array<any>;
    return {
      ...(obj as any),
      id: createId('ink'),
      points: pts.map((p) => ({ ...p })),
    } as any;
  }

  if (obj.type === 'highlight') {
    return {
      ...(obj as any),
      id: createId('hl'),
      rect: { ...(obj as any).rect },
    } as any;
  }

  if (obj.type === 'image') {
    return {
      ...(obj as any),
      id: createId('img'),
      rect: { ...(obj as any).rect },
      crop: (obj as any).crop ? { ...(obj as any).crop } : undefined,
      filters: (obj as any).filters ? { ...(obj as any).filters } : undefined,
      transform: (obj as any).transform ? { ...(obj as any).transform } : undefined,
      mask: (obj as any).mask ? ({ ...((obj as any).mask as any) } as any) : undefined,
    } as any;
  }

  if (obj.type === 'shape') {
    return {
      ...(obj as any),
      id: createId('shp'),
      style: { ...(obj as any).style },
    } as any;
  }

  if (obj.type === 'pageBorder') {
    return {
      ...(obj as any),
      id: createId('brd'),
    } as any;
  }

  if (obj.type === 'pageBackground') {
    return {
      ...(obj as any),
      id: createId('bg'),
    } as any;
  }

  // Fallback (shouldn't happen with current union)
  return { ...(obj as any), id: createId('obj') } as any;
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function createEmptyDoc(title = 'Untitled') {
  const now = Date.now();
  const doc: PdfDocModel = {
    id: createId('doc'),
    meta: { title, createdAt: now, updatedAt: now },
    pageCount: 0,
    pageSizes: [],
    pageRotation: [],
    pageCrop: [],
    pageOrder: [],
    overlays: {},
    linksByPage: {},
    ops: [],
    undo: [],
    redo: [],
  };
  return doc;
}

function createLinkId(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  return `link_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeLinkRect(rect: LinkRect, pageW: number, pageH: number): LinkRect {
  const x1 = Number(rect.x);
  const y1 = Number(rect.y);
  const x2 = Number(rect.x) + Number(rect.w);
  const y2 = Number(rect.y) + Number(rect.h);

  const left = Math.max(0, Math.min(pageW, Math.min(x1, x2)));
  const right = Math.max(0, Math.min(pageW, Math.max(x1, x2)));
  const top = Math.max(0, Math.min(pageH, Math.min(y1, y2)));
  const bottom = Math.max(0, Math.min(pageH, Math.max(y1, y2)));

  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

function clampInternalLinkTarget(target: LinkTarget, pageCount: number): LinkTarget {
  if (target.kind !== 'internal') return target;
  const idx = Math.max(0, Math.min(Math.max(0, pageCount - 1), Number(target.pageIndex) || 0));
  return {
    kind: 'internal',
    pageIndex: idx,
    ...(typeof target.x === 'number' && Number.isFinite(target.x) ? { x: target.x } : null),
    ...(typeof target.y === 'number' && Number.isFinite(target.y) ? { y: target.y } : null),
    ...(typeof target.zoom === 'number' && Number.isFinite(target.zoom) ? { zoom: target.zoom } : null),
  };
}

function ensurePageSizePoints(doc: PdfDocModel): NonNullable<PdfDocModel['pageSizePoints']> {
  if (doc.pageSizePoints && doc.pageSizePoints.length === doc.pageCount) return doc.pageSizePoints;
  return Array.from({ length: doc.pageCount }, (_, i) => {
    const s = doc.pageSizes[i] ?? { w: 595, h: 842 };
    const match = findPresetForSize({ w: s.w, h: s.h });
    return {
      widthPoints: s.w,
      heightPoints: s.h,
      sourceSizeType: match ? 'preset' : 'inferred',
      presetId: match?.preset.id ?? null,
    };
  });
}

async function createBlankOnePagePdfBytes(size: { w: number; h: number }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([size.w, size.h]);
  // Keep it explicit and predictable (avoid inheriting any /Rotate via page tree when
  // this PDF later gets merged/edited).
  page.setRotation(degrees(0));
  const bytes = await pdf.save();
  return new Uint8Array(bytes);
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: null,
  activePageIndex: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDirty: false,
  status: { loading: false, error: null },

  selectedLinkId: null,

  clearDoc: () => {
    set({
      doc: null,
      activePageIndex: 0,
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDirty: false,
      status: { loading: false, error: null },
      selectedLinkId: null,
    });
  },

  newDoc: async () => {
    set((s) => ({ ...s, status: { loading: true, error: null } }));
    try {
      const size = { w: 595, h: 842 }; // A4-ish in PDF points
      const match = findPresetForSize({ w: size.w, h: size.h });
      const basePdfBytes = await createBlankOnePagePdfBytes(size);

      const now = Date.now();
      const doc: PdfDocModel = {
        ...createEmptyDoc('Blank doc'),
        meta: { title: 'Blank doc', createdAt: now, updatedAt: now },
        basePdfBytes,
        pageCount: 1,
        pageSizePoints: [
          {
            widthPoints: size.w,
            heightPoints: size.h,
            sourceSizeType: match ? 'preset' : 'custom',
            presetId: match?.preset.id ?? null,
          },
        ],
        defaultPageSizePoints: {
          widthPoints: size.w,
          heightPoints: size.h,
          presetId: match?.preset.id ?? null,
        },
        pageSizes: [size],
        pageRotation: [0],
        pageCrop: [null],
        pageOrder: [0],
        overlays: {},
        linksByPage: {},
        ops: [],
        undo: [],
        redo: [],
      };

      set({
        doc,
        activePageIndex: 0,
        zoom: 1,
        pan: { x: 0, y: 0 },
        isDirty: false,
        selectedLinkId: null,
        status: { loading: false, error: null },
      });
    } catch (err) {
      set((s) => ({
        ...s,
        status: {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to create blank document',
        },
      }));
      throw err;
    }
  },

  loadPdfFromFile: async (file: File) => {
    set((s) => ({ ...s, status: { loading: true, error: null } }));
    let warnTimerId: number | null = null;
    try {
      const isDev = import.meta.env.DEV;
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const emitPerf = (name: string, ms: number, extra?: any) => {
        if (!isDev) return;
        try {
          if (typeof window === 'undefined') return;
          window.dispatchEvent(
            new CustomEvent('xpdf:perf', {
              detail: { name, ms: Math.round(ms), extra: extra ?? null },
            }),
          );
        } catch {
          // ignore
        }
      };

      let stage: 'read' | 'pdf' | 'firstPageSize' | 'setDoc' = 'read';
      const warnAfterMs = 5000;
      const hardTimeoutMs = isDev ? 30000 : 0;

      const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
        if (!isDev || ms <= 0) return await p;
        let t: number | null = null;
        const timeout = new Promise<T>((_, reject) => {
          t = window.setTimeout(() => reject(new Error(`Timed out (${label}) after ${ms}ms`)), ms);
        });
        try {
          return await Promise.race([p, timeout]);
        } finally {
          if (t != null) window.clearTimeout(t);
        }
      };

      if (isDev) {
        warnTimerId = window.setTimeout(() => {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const dt = now - t0;
          // eslint-disable-next-line no-console
          console.warn('[xpdf:perf] loadPdfFromFile still running', {
            ms: Math.round(dt),
            stage,
            file: { name: file.name, size: file.size, type: file.type },
          });
        }, warnAfterMs);
      }

      const buf = await file.arrayBuffer();
      // Keep an owned, reusable copy in the store.
      const bytes = new Uint8Array(buf);
      const tRead = typeof performance !== 'undefined' ? performance.now() : Date.now();

      stage = 'pdf';
      const pdf = await withTimeout(getPdfDocument(bytes), hardTimeoutMs, 'pdfjs:getPdfDocument');
      const tPdf = typeof performance !== 'undefined' ? performance.now() : Date.now();

      emitPerf('pdfParsed', tPdf - t0, { pages: pdf?.numPages, file: { name: file.name, size: file.size } });

      const pageCount = pdf.numPages;
      // Compute only the first page size synchronously so the editor can show quickly.
      // Remaining page sizes are computed in the background.
      stage = 'firstPageSize';
      const firstSize =
        pageCount > 0
          ? await withTimeout(getPageViewportSize(pdf, 0), hardTimeoutMs, 'pdfjs:getPageViewportSize(page0)')
          : { w: 595, h: 842 };
      const tFirst = typeof performance !== 'undefined' ? performance.now() : Date.now();

      emitPerf('firstPageSize', tFirst - t0, { w: firstSize.w, h: firstSize.h });

      const pageSizes: Array<{ w: number; h: number }> = Array.from({ length: pageCount }, () => firstSize);

      const firstMatch = findPresetForSize({ w: firstSize.w, h: firstSize.h });
      const defaultPageSizePoints = {
        widthPoints: firstSize.w,
        heightPoints: firstSize.h,
        presetId: firstMatch?.preset.id ?? null,
      };

      const pageSizePoints: NonNullable<PdfDocModel['pageSizePoints']> = Array.from({ length: pageCount }, () => ({
        widthPoints: firstSize.w,
        heightPoints: firstSize.h,
        sourceSizeType: firstMatch ? 'preset' : 'inferred',
        presetId: firstMatch?.preset.id ?? null,
      }));

      const tDoc = typeof performance !== 'undefined' ? performance.now() : Date.now();

      stage = 'setDoc';

      const now = Date.now();
      const doc: PdfDocModel = {
        id: createId('doc'),
        meta: { title: file.name.replace(/\.pdf$/i, ''), createdAt: now, updatedAt: now },
        // Keep the same Uint8Array identity so PdfCanvas can reuse the cached PDFDocumentProxy.
        basePdfBytes: bytes,
        pageCount,
        pageSizePoints,
        defaultPageSizePoints,
        pageSizes,
        pageRotation: Array.from({ length: pageCount }, () => 0),
        pageCrop: Array.from({ length: pageCount }, () => null),
        pageOrder: Array.from({ length: pageCount }, (_, i) => i),
        overlays: {},
        linksByPage: {},
        ops: [],
        undo: [],
        redo: [],
      };

      set({
        doc,
        activePageIndex: 0,
        zoom: 1,
        pan: { x: 0, y: 0 },
        isDirty: false,
        selectedLinkId: null,
        status: { loading: false, error: null },
      });

      emitPerf('docSet', tDoc - t0, { pages: pageCount, title: doc.meta.title });

      // Lightweight perf logging (only if something is actually slow).
      if (import.meta.env.DEV) {
        const msRead = tRead - t0;
        const msPdf = tPdf - tRead;
        const msFirst = tFirst - tPdf;
        const msDoc = tDoc - tFirst;
        const total = tDoc - t0;
        if (total > 1500) {
          // eslint-disable-next-line no-console
          console.log('[xpdf:perf] loadPdfFromFile(ms)', {
            total: Math.round(total),
            read: Math.round(msRead),
            pdf: Math.round(msPdf),
            firstPageSize: Math.round(msFirst),
            docSet: Math.round(msDoc),
            pages: pageCount,
          });
        }
      }

      // Fill in accurate sizes for all pages asynchronously (limits concurrency to keep UI responsive).
      if (pageCount > 1) {
        const docId = doc.id;
        void (async () => {
          const indices = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
          const concurrency = 6;
          const out: Array<{ w: number; h: number }> = Array.from({ length: pageCount }, () => firstSize);
          let nextIndex = 0;

          const worker = async () => {
            for (;;) {
              const k = nextIndex;
              nextIndex += 1;
              if (k >= indices.length) return;
              const pageIdx = indices[k];
              try {
                // eslint-disable-next-line no-await-in-loop
                out[pageIdx] = await getPageViewportSize(pdf, pageIdx);
              } catch {
                // keep fallback size
              }
            }
          };

          await Promise.all(Array.from({ length: Math.min(concurrency, indices.length) }, () => worker()));

          const nextPoints: NonNullable<PdfDocModel['pageSizePoints']> = out.map((s) => {
            const match = findPresetForSize({ w: s.w, h: s.h });
            return {
              widthPoints: s.w,
              heightPoints: s.h,
              sourceSizeType: match ? 'preset' : 'inferred',
              presetId: match?.preset.id ?? null,
            };
          });

          set((s) => {
            if (!s.doc) return s;
            if (s.doc.id !== docId) return s;
            return {
              ...s,
              doc: {
                ...s.doc,
                pageSizes: out,
                pageSizePoints: nextPoints,
              },
            };
          });
        })();
      }
    } catch (err) {
      set((s) => ({
        ...s,
        status: {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load PDF',
        },
      }));
      throw err;
    } finally {
      if (warnTimerId != null) {
        try {
          window.clearTimeout(warnTimerId);
        } catch {
          // ignore
        }
        warnTimerId = null;
      }
    }
  },

  setDocTitle: (title) => {
    const doc = get().doc;
    if (!doc) return;
    const nextTitle = title;
    const now = Date.now();
    set((s) => ({
      ...s,
      doc: s.doc ? { ...s.doc, meta: { ...s.doc.meta, title: nextTitle, updatedAt: now } } : s.doc,
      isDirty: true,
    }));
  },

  setActivePage: (index) => {
    const doc = get().doc;
    if (!doc) return;
    set({ activePageIndex: clampIndex(index, doc.pageCount) });
  },

  reorderPages: (from, to) => {
    const doc = get().doc;
    if (!doc) return;
    if (from === to) return;
    const beforeOrder = doc.pageOrder;
    const afterOrder = [...beforeOrder];
    const [moved] = afterOrder.splice(from, 1);
    afterOrder.splice(to, 0, moved);
    get().pushOp({ type: 'page/reorder', from, to, beforeOrder, afterOrder });
  },

  rotatePage: (index, rotation) => {
    const doc = get().doc;
    if (!doc) return;
    const before = doc.pageRotation[index] ?? 0;
    const after = rotation;
    get().pushOp({ type: 'page/rotate', pageIndex: index, before, after });
  },

  setPageCrop: (index, crop) => {
    const doc = get().doc;
    if (!doc) return;
    const next = doc.pageCrop ? [...doc.pageCrop] : Array.from({ length: doc.pageCount }, () => null);
    next[index] = crop;
    set((s) => ({
      ...s,
      doc: s.doc ? { ...s.doc, pageCrop: next } : s.doc,
      isDirty: true,
    }));
  },

  rotatePages: (indices, delta) => {
    const doc = get().doc;
    if (!doc) return;
    const uniq = Array.from(new Set(indices)).filter((i) => i >= 0 && i < doc.pageCount);
    if (uniq.length === 0) return;
    const nextRot = [...doc.pageRotation];
    for (const idx of uniq) {
      const before = doc.pageRotation[idx] ?? 0;
      const after = (((before + delta) % 360) + 360) % 360;
      nextRot[idx] = (after === 0 ? 0 : after === 90 ? 90 : after === 180 ? 180 : 270) as any;
    }
    set((s) => ({
      ...s,
      doc: s.doc ? { ...s.doc, pageRotation: nextRot } : s.doc,
      isDirty: true,
    }));
  },

  setPageSizeForPages: ({ pageIndices, sizePoints, sourceSizeType = 'custom', setAsDefault = false }) => {
    const doc = get().doc;
    if (!doc) return;
    const uniq = Array.from(new Set(pageIndices)).filter((i) => i >= 0 && i < doc.pageCount);
    if (uniq.length === 0) return;

    const w = Math.max(1, Number(sizePoints.widthPoints));
    const h = Math.max(1, Number(sizePoints.heightPoints));
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;

    const presetId = sizePoints.presetId ?? null;

    set((s) => {
      if (!s.doc) return s;
      const nextPageSizes = [...s.doc.pageSizes];
      for (const idx of uniq) nextPageSizes[idx] = { w, h };

      const prevPoints = ensurePageSizePoints(s.doc);
      const nextPoints = [...prevPoints];
      for (const idx of uniq) {
        nextPoints[idx] = {
          widthPoints: w,
          heightPoints: h,
          sourceSizeType,
          presetId,
        };
      }

      const nextDefault = setAsDefault
        ? { widthPoints: w, heightPoints: h, presetId }
        : (s.doc.defaultPageSizePoints ?? {
            widthPoints: nextPoints[0]?.widthPoints ?? 595,
            heightPoints: nextPoints[0]?.heightPoints ?? 842,
            presetId: nextPoints[0]?.presetId ?? null,
          });

      return {
        ...s,
        doc: {
          ...s.doc,
          pageSizes: nextPageSizes,
          pageSizePoints: nextPoints,
          defaultPageSizePoints: nextDefault,
        },
        isDirty: true,
      };
    });
  },

  deletePages: (indices) => {
    const doc = get().doc;
    if (!doc) return;
    const uniq = Array.from(new Set(indices)).filter((i) => i >= 0 && i < doc.pageCount).sort((a, b) => a - b);
    if (uniq.length === 0) return;
    if (uniq.length >= doc.pageCount) throw new Error('Cannot delete all pages');

    // Delete from highest to lowest to keep indices stable.
    for (let i = uniq.length - 1; i >= 0; i--) {
      get().pushOp({ type: 'page/delete', pageIndex: uniq[i], deletedOriginalPageIndex: doc.pageOrder[uniq[i]] });
    }
    const afterDoc = get().doc;
    const nextCount = afterDoc?.pageCount ?? 0;
    set((s) => ({ ...s, activePageIndex: clampIndex(s.activePageIndex, nextCount) }));
  },

  deletePage: (index) => {
    const doc = get().doc;
    if (!doc) return;
    const deletedOriginalPageIndex = doc.pageOrder[index];
    get().pushOp({ type: 'page/delete', pageIndex: index, deletedOriginalPageIndex });
    set((s) => ({ ...s, activePageIndex: clampIndex(index, Math.max(0, doc.pageCount - 1)) }));
  },

  addOverlayObject: (pageIndex, obj) => {
    try {
      const w = window as any;
      const enabled = w?.localStorage?.getItem('xpdf:debug:image') === '1';
      if (enabled && (obj as any)?.type === 'image') {
        // eslint-disable-next-line no-console
        console.log('[xpdf:image] addOverlayObject', {
          pageIndex,
          id: (obj as any)?.id ?? null,
          src: String((obj as any)?.src ?? '').slice(0, 64),
          hasDoc: Boolean(get().doc),
        });
      }
    } catch {
      // ignore
    }
    get().pushOp({ type: 'overlay/add', pageIndex, object: obj });
  },

  updateOverlayObject: (pageIndex, objId, patch) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const before = page?.objects.find((o) => o.id === objId);
    if (!before) return;

    try {
      const w = window as any;
      const enabled = w?.localStorage?.getItem('xpdf:debug:image') === '1';
      if (enabled && (before as any)?.type === 'image' && (patch as any)?.src) {
        // eslint-disable-next-line no-console
        console.log('[xpdf:image] updateOverlayObject:src', {
          pageIndex,
          id: objId,
          src: String((patch as any)?.src ?? '').slice(0, 64),
        });
      }
    } catch {
      // ignore
    }

    const after = { ...(before as any), ...(patch as any) } as OverlayObject;
    get().pushOp({
      type: 'overlay/update',
      pageIndex,
      objectId: objId,
      patch,
      before,
      after,
    });
  },

  removeOverlayObject: (pageIndex, objId) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const object = page?.objects.find((o) => o.id === objId);
    if (!object) return;
    get().pushOp({ type: 'overlay/remove', pageIndex, object });
  },

  duplicateOverlayObject: (pageIndex, objId) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const objects = page?.objects ?? [];
    const idx = objects.findIndex((o) => o.id === objId);
    if (idx < 0) return;

    const original = objects[idx] as OverlayObject;
    const copy = cloneOverlayObjectForDuplicate(original);

    const nextObjects = [...objects];
    nextObjects.splice(idx + 1, 0, copy);

    const now = Date.now();
    set((s) => ({
      ...s,
      doc: s.doc
        ? {
            ...s.doc,
            meta: { ...s.doc.meta, updatedAt: now },
            overlays: {
              ...s.doc.overlays,
              [pageIndex]: { objects: nextObjects },
            },
          }
        : s.doc,
      isDirty: true,
    }));
  },

  setPageBorder: (pageIndex, border) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const existing = page?.objects.find((o) => o.type === 'pageBorder') as PageBorderObj | undefined;

    if (!border) {
      if (existing) get().removeOverlayObject(pageIndex, existing.id);
      return;
    }

    if (existing) {
      get().updateOverlayObject(pageIndex, existing.id, border as any);
      return;
    }

    get().addOverlayObject(pageIndex, {
      id: createId('brd'),
      type: 'pageBorder',
      ...(border as any),
    } as any);
  },

  setPageBackground: (pageIndex, bg) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const existing = page?.objects.find((o) => o.type === 'pageBackground') as PageBackgroundObj | undefined;

    if (!bg) {
      if (existing) get().removeOverlayObject(pageIndex, existing.id);
      return;
    }

    if (existing) {
      get().updateOverlayObject(pageIndex, existing.id, bg as any);
      return;
    }

    get().addOverlayObject(pageIndex, {
      id: createId('bg'),
      type: 'pageBackground',
      ...(bg as any),
    } as any);
  },

  addShape: (pageIndex, shape) => {
    get().addOverlayObject(pageIndex, shape as any);
  },

  patchShape: (pageIndex, shapeId, patch) => {
    get().updateOverlayObject(pageIndex, shapeId, patch as any);
  },

  removeShape: (pageIndex, shapeId) => {
    get().removeOverlayObject(pageIndex, shapeId);
  },

  reorderShapeLayer: (pageIndex, shapeId, direction) => {
    const doc = get().doc;
    if (!doc) return;
    const page = doc.overlays[pageIndex];
    const objects = page?.objects ?? [];
    const shapes = objects.filter((o) => o.type === 'shape') as ShapeObj[];
    if (shapes.length < 2) return;
    const idx = shapes.findIndex((s) => s.id === shapeId);
    if (idx < 0) return;

    let nextShapes = [...shapes];
    const move = (from: number, to: number) => {
      if (from === to) return;
      const arr = [...nextShapes];
      const [it] = arr.splice(from, 1);
      arr.splice(to, 0, it);
      nextShapes = arr;
    };

    if (direction === 'forward') move(idx, Math.min(nextShapes.length - 1, idx + 1));
    if (direction === 'backward') move(idx, Math.max(0, idx - 1));
    if (direction === 'front') move(idx, nextShapes.length - 1);
    if (direction === 'back') move(idx, 0);

    let si = 0;
    const rebuilt = objects.map((o) => (o.type === 'shape' ? (nextShapes[si++] as any) : o));

    set((s) => ({
      ...s,
      doc: s.doc
        ? {
            ...s.doc,
            overlays: {
              ...s.doc.overlays,
              [pageIndex]: { objects: rebuilt },
            },
          }
        : s.doc,
      isDirty: true,
    }));
  },

  addLinkMark: (pageIndex, rect, target) => {
    const doc = get().doc;
    if (!doc) return null;
    if (pageIndex < 0 || pageIndex >= doc.pageCount) return null;

    const size = doc.pageSizes[pageIndex] ?? { w: 595, h: 842 };
    const now = Date.now();
    const id = createLinkId();

    const mark: LinkMark = {
      id,
      pageIndex,
      rect: normalizeLinkRect(rect, size.w, size.h),
      target: clampInternalLinkTarget(target, doc.pageCount),
      createdAt: now,
      updatedAt: now,
    };

    set((s) => {
      if (!s.doc) return s;
      const existing = s.doc.linksByPage?.[pageIndex] ?? [];
      return {
        ...s,
        doc: {
          ...s.doc,
          meta: { ...s.doc.meta, updatedAt: now },
          linksByPage: {
            ...(s.doc.linksByPage ?? {}),
            [pageIndex]: [...existing, mark],
          },
        },
        selectedLinkId: id,
        isDirty: true,
      };
    });

    if ((import.meta as any).env?.DEV) {
      try {
        if (mark.target.kind === 'external' && !String(mark.target.url || '').trim()) {
          // eslint-disable-next-line no-console
          console.warn('[link] created external link with empty url', { id: mark.id });
        }
      } catch {
        // ignore
      }
    }

    return mark;
  },

  updateLinkMark: (id, patch) => {
    const doc = get().doc;
    if (!doc) return;
    const now = Date.now();

    set((s) => {
      if (!s.doc) return s;
      const linksByPage = s.doc.linksByPage ?? {};

      let pageIndex: number | null = null;
      let idx = -1;

      for (const [k, arr] of Object.entries(linksByPage)) {
        const p = Number(k);
        if (!Number.isFinite(p)) continue;
        const i = (arr ?? []).findIndex((m) => m.id === id);
        if (i >= 0) {
          pageIndex = p;
          idx = i;
          break;
        }
      }

      if (pageIndex == null || idx < 0) return s;

      const arr = linksByPage[pageIndex] ?? [];
      const before = arr[idx];
      if (!before) return s;

      const size = s.doc.pageSizes[pageIndex] ?? { w: 595, h: 842 };

      const nextRect = patch.rect ? normalizeLinkRect(patch.rect as any, size.w, size.h) : before.rect;
      const nextTarget = patch.target ? clampInternalLinkTarget(patch.target as any, s.doc.pageCount) : before.target;

      const after: LinkMark = {
        ...before,
        ...(patch as any),
        rect: nextRect,
        target: nextTarget,
        updatedAt: now,
      };

      const nextArr = [...arr];
      nextArr[idx] = after;

      return {
        ...s,
        doc: {
          ...s.doc,
          meta: { ...s.doc.meta, updatedAt: now },
          linksByPage: {
            ...linksByPage,
            [pageIndex]: nextArr,
          },
        },
        isDirty: true,
      };
    });
  },

  removeLinkMark: (id) => {
    const doc = get().doc;
    if (!doc) return;
    const now = Date.now();

    set((s) => {
      if (!s.doc) return s;
      const linksByPage = s.doc.linksByPage ?? {};
      let changed = false;

      const nextLinksByPage: PdfDocModel['linksByPage'] = { ...linksByPage };
      for (const [k, arr] of Object.entries(linksByPage)) {
        const p = Number(k);
        if (!Number.isFinite(p)) continue;
        const beforeArr = arr ?? [];
        const afterArr = beforeArr.filter((m) => m.id !== id);
        if (afterArr.length !== beforeArr.length) {
          nextLinksByPage[p] = afterArr;
          changed = true;
        }
      }

      if (!changed) return s;

      return {
        ...s,
        doc: {
          ...s.doc,
          meta: { ...s.doc.meta, updatedAt: now },
          linksByPage: nextLinksByPage,
        },
        selectedLinkId: s.selectedLinkId === id ? null : s.selectedLinkId,
        isDirty: true,
      };
    });
  },

  setSelectedLinkId: (id) => set((s) => ({ ...s, selectedLinkId: id })),

  getSelectedLink: () => {
    const s = get();
    const doc = s.doc;
    const id = s.selectedLinkId;
    if (!doc || !id) return null;
    for (const arr of Object.values(doc.linksByPage ?? {})) {
      const hit = (arr ?? []).find((m) => m.id === id);
      if (hit) return hit;
    }
    return null;
  },

  listLinkMarks: (pageIndex) => {
    const doc = get().doc;
    if (!doc) return [];
    return doc.linksByPage?.[pageIndex] ?? [];
  },

  hitTestLink: (pageIndex, p) => {
    const doc = get().doc;
    if (!doc) return null;
    const list = doc.linksByPage?.[pageIndex] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const r = m.rect;
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return m;
    }
    return null;
  },

  pushOp: (op) => {
    const doc = get().doc;
    if (!doc) return;

    const nextDoc = applyOp(doc, op);
    const undoEntry = invertOp(doc, op);

    // Minimal Phase 1 undo/redo scaffold:
    // - store inverse ops on undo stack
    // - on undo: apply inverse, push original onto redo (best effort)
    set({
      doc: {
        ...nextDoc,
        ops: [...doc.ops, op],
        undo: [...doc.undo, undoEntry],
        redo: [],
      },
      isDirty: true,
    });
  },

  undo: () => {
    const doc = get().doc;
    if (!doc) return;
    const inv = doc.undo[doc.undo.length - 1];
    if (!inv) return;

    const nextDoc = applyOp(doc, inv);
    // TODO(Phase 2): represent redo as forward ops; here we store the inverse again.
    const redoEntry = invertOp(doc, inv);

    set({
      doc: {
        ...nextDoc,
        undo: doc.undo.slice(0, -1),
        redo: [...doc.redo, redoEntry],
      },
      isDirty: true,
    });
  },

  redo: () => {
    const doc = get().doc;
    if (!doc) return;
    const op = doc.redo[doc.redo.length - 1];
    if (!op) return;

    const nextDoc = applyOp(doc, op);
    const undoEntry = invertOp(doc, op);

    set({
      doc: {
        ...nextDoc,
        redo: doc.redo.slice(0, -1),
        undo: [...doc.undo, undoEntry],
      },
      isDirty: true,
    });
  },
}));
