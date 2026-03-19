import { useDocumentStore } from '../state/documentStore';
import { FEATURE_USE_WORKERS, exportInWorker } from './workerClient';
import { exportPagesFromModel } from '../pageops/extract';
import { useUiStore } from '../state/uiStore';

export async function exportCurrentDoc(): Promise<Uint8Array> {
  const { doc } = useDocumentStore.getState();
  if (!doc?.basePdfBytes) throw new Error('No PDF loaded');

  const { exportStamps } = useUiStore.getState();

  // Optional worker path (disabled in Phase 1)
  if (FEATURE_USE_WORKERS) {
    const res = await exportInWorker({ type: 'export', basePdfBytes: doc.basePdfBytes });
    if (!res.ok || !res.bytes) throw new Error(res.error || 'Worker export failed');
    return res.bytes;
  }

  // Main-thread fallback
  // Export by rebuilding a new PDF in current editor order, applying crop/rotation/stamps.
  // Overlays (if stampOverlays supports it) are still stamped separately.
  const bytes = await exportPagesFromModel({
    doc,
    pageIndices: Array.from({ length: doc.pageCount }, (_, i) => i),
    stampSettings: exportStamps,
  });

  return bytes;
}
