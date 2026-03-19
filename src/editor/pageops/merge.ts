import { PDFDocument } from 'pdf-lib';

export async function mergePdfBytes(params: {
  basePdfBytes: Uint8Array;
  otherPdfBytes: Uint8Array;
}): Promise<{
  bytes: Uint8Array;
  appendedPageSizes: Array<{ w: number; h: number }>;
  newOriginalStart: number;
}> {
  const base = await PDFDocument.load(params.basePdfBytes);
  const other = await PDFDocument.load(params.otherPdfBytes);

  const newOriginalStart = base.getPageCount();

  const appendedPageSizes: Array<{ w: number; h: number }> = [];
  for (const p of other.getPages()) {
    const s = p.getSize();
    appendedPageSizes.push({ w: s.width, h: s.height });
  }

  const otherPages = await base.copyPages(other, other.getPageIndices());
  for (const p of otherPages) base.addPage(p);

  const bytes = await base.save();
  return { bytes, appendedPageSizes, newOriginalStart };
}
