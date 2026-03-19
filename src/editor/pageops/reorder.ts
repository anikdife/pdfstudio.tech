import type { PdfDocModel } from '../state/types';
import { PDFDocument } from 'pdf-lib';

export function reorderDocModelArrays(doc: PdfDocModel, beforeOrder: number[], afterOrder: number[]) {
  // Remap per-editor-index arrays/maps by tracking which previous editor index now contains a given original page.
  const idxByOriginal = new Map<number, number>();
  for (let i = 0; i < beforeOrder.length; i++) idxByOriginal.set(beforeOrder[i], i);

  const remapIndex = (toEditorIndex: number) => {
    const original = afterOrder[toEditorIndex];
    const fromEditorIndex = idxByOriginal.get(original);
    return typeof fromEditorIndex === 'number' ? fromEditorIndex : -1;
  };

  const nextPageSizes: PdfDocModel['pageSizes'] = [];
  const nextPageSizePoints: NonNullable<PdfDocModel['pageSizePoints']> | undefined = doc.pageSizePoints
    ? ([] as NonNullable<PdfDocModel['pageSizePoints']>)
    : undefined;
  const nextRotations: PdfDocModel['pageRotation'] = [];
  const nextCrops: PdfDocModel['pageCrop'] = doc.pageCrop
    ? ([] as NonNullable<PdfDocModel['pageCrop']>)
    : undefined;
  const nextOverlays: PdfDocModel['overlays'] = {};
  const nextLinksByPage: PdfDocModel['linksByPage'] = {};

  const toEditorIndexByOriginal = new Map<number, number>();
  for (let i = 0; i < afterOrder.length; i++) toEditorIndexByOriginal.set(afterOrder[i], i);

  const remapInternalTargetPageIndex = (targetEditorIndex: number) => {
    const original = beforeOrder[targetEditorIndex];
    const to = toEditorIndexByOriginal.get(original);
    return typeof to === 'number' ? to : targetEditorIndex;
  };

  for (let to = 0; to < afterOrder.length; to++) {
    const from = remapIndex(to);
    nextPageSizes[to] = doc.pageSizes[from] ?? doc.pageSizes[to];
    if (nextPageSizePoints) {
      const fallback = nextPageSizes[to];
      nextPageSizePoints[to] =
        doc.pageSizePoints?.[from] ??
        doc.pageSizePoints?.[to] ??
        (fallback
          ? { widthPoints: fallback.w, heightPoints: fallback.h, sourceSizeType: 'inferred', presetId: null }
          : { widthPoints: 595, heightPoints: 842, sourceSizeType: 'inferred', presetId: null });
    }
    nextRotations[to] = doc.pageRotation[from] ?? doc.pageRotation[to] ?? 0;
    if (nextCrops) nextCrops[to] = doc.pageCrop?.[from] ?? null;
    if (from >= 0 && doc.overlays[from]) nextOverlays[to] = doc.overlays[from];

    const links = doc.linksByPage?.[from] ?? [];
    if (links.length > 0) {
      nextLinksByPage[to] = links.map((m) => {
        const t = (m as any).target;
        if (t?.kind === 'internal' && typeof t.pageIndex === 'number') {
          return {
            ...(m as any),
            pageIndex: to,
            target: { ...t, pageIndex: remapInternalTargetPageIndex(t.pageIndex) },
          };
        }
        return { ...(m as any), pageIndex: to };
      });
    }
  }

  return { nextPageSizes, nextPageSizePoints, nextRotations, nextCrops, nextOverlays, nextLinksByPage };
}

export async function reorderPdfBytes(params: {
  basePdfBytes: Uint8Array;
  originalPageOrder: number[];
}): Promise<Uint8Array> {
  const base = await PDFDocument.load(params.basePdfBytes);
  const out = await PDFDocument.create();

  const total = base.getPageCount();
  const indices = (params.originalPageOrder ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < total);

  if (indices.length === 0) {
    // If no valid indices provided, keep original bytes.
    return params.basePdfBytes;
  }

  const pages = await out.copyPages(base, indices);
  for (const p of pages) out.addPage(p);

  return await out.save();
}
