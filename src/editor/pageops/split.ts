import type { PdfDocModel } from '../state/types';
import { parseRanges, indicesFromRanges } from './ranges';
import { exportPagesFromModel } from './extract';
import type { ExportStampSettings } from './stamping';

export async function splitPdfByRanges(params: {
  doc: PdfDocModel;
  rangesText: string;
  stampSettings: ExportStampSettings;
}): Promise<{ files: Array<{ filename: string; bytes: Uint8Array }> } | { error: string }> {
  const total = params.doc.pageCount;
  const parsed = parseRanges(params.rangesText, total);
  if (!parsed.ok) return { error: parsed.error };

  const files: Array<{ filename: string; bytes: Uint8Array }> = [];

  let idx = 1;
  for (const r of parsed.ranges) {
    const pageIndices = indicesFromRanges([r], total);
    const bytes = await exportPagesFromModel({
      doc: params.doc,
      pageIndices,
      stampSettings: params.stampSettings,
    });

    const start = r.start + 1;
    const end = r.end + 1;
    const suffix = start === end ? `${start}` : `${start}-${end}`;
    files.push({ filename: `${params.doc.meta.title || 'document'}-split-${idx}-${suffix}.pdf`, bytes });
    idx++;
  }

  return { files };
}
