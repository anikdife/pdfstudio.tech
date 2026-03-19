import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdf } from './pdfjs';

// Phase 1: optional worker placeholders.
export const FEATURE_USE_RENDER_WORKER = false;

const cache = new WeakMap<Uint8Array, Promise<PDFDocumentProxy>>();

export function getPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const cached = cache.get(bytes);
  if (cached) return cached;

  const p = loadPdf(bytes);
  cache.set(bytes, p);

  // Important: if pdf.js rejects (e.g. password not provided), do not memoize the failure.
  // This allows retrying on the same bytes after the user enters a password.
  p.catch(() => {
    try {
      if (cache.get(bytes) === p) cache.delete(bytes);
    } catch {
      // ignore
    }
  });

  return p;
}
