import { PDFDocument, degrees } from 'pdf-lib';

export async function appendBlankPage(params: {
  basePdfBytes: Uint8Array;
  size: { w: number; h: number };
}): Promise<{ bytes: Uint8Array; newOriginalIndex: number }> {
  const pdf = await PDFDocument.load(params.basePdfBytes);
  const before = pdf.getPageCount();
  const page = pdf.addPage([params.size.w, params.size.h]);
  // Important: PDFs can define /Rotate on parent nodes in the page tree.
  // New pages may inherit that rotation unless we explicitly override it.
  // If we don't, exports/extracts can look vertically flipped on blank pages.
  page.setRotation(degrees(0));
  const bytes = await pdf.save();
  return { bytes, newOriginalIndex: before };
}

export async function appendImagePage(params: {
  basePdfBytes: Uint8Array;
  imageBytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  targetSize: { w: number; h: number };
}): Promise<{ bytes: Uint8Array; newOriginalIndex: number; size: { w: number; h: number } }> {
  const pdf = await PDFDocument.load(params.basePdfBytes);
  const before = pdf.getPageCount();

  const page = pdf.addPage([params.targetSize.w, params.targetSize.h]);
  // Same reasoning as appendBlankPage: prevent inheriting /Rotate.
  page.setRotation(degrees(0));
  const embedded = params.mime === 'image/png'
    ? await pdf.embedPng(params.imageBytes)
    : await pdf.embedJpg(params.imageBytes);

  const imgW = embedded.width;
  const imgH = embedded.height;

  const scale = Math.min(params.targetSize.w / imgW, params.targetSize.h / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const x = (params.targetSize.w - drawW) / 2;
  const y = (params.targetSize.h - drawH) / 2;

  page.drawImage(embedded, { x, y, width: drawW, height: drawH });

  const bytes = await pdf.save();
  return { bytes, newOriginalIndex: before, size: params.targetSize };
}
