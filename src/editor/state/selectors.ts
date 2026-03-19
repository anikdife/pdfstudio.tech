import type { PdfDocModel } from './types';

export function selectActivePage(doc: PdfDocModel | null, activePageIndex: number) {
  if (!doc) return null;
  const idx = Math.max(0, Math.min(activePageIndex, Math.max(0, doc.pageCount - 1)));
  const sizePoints = doc.pageSizePoints?.[idx];
  const size = sizePoints
    ? { w: sizePoints.widthPoints, h: sizePoints.heightPoints }
    : doc.pageSizes[idx];
  return {
    pageIndex: idx,
    size,
    rotation: doc.pageRotation[idx],
    overlays: doc.overlays[idx] ?? { objects: [] },
    originalPageIndex: doc.pageOrder[idx] ?? idx,
  };
}
