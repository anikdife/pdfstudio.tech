// Phase 1: workers are optional and OFF by default.
// TODO(Phase 2): implement render/export pipelines in workers.

export const FEATURE_USE_WORKERS = false;

export type ExportWorkerRequest = {
  type: 'export';
  basePdfBytes: Uint8Array;
};

export type ExportWorkerResponse = {
  ok: boolean;
  bytes?: Uint8Array;
  error?: string;
};

export async function exportInWorker(_req: ExportWorkerRequest): Promise<ExportWorkerResponse> {
  return {
    ok: false,
    error: 'Worker export not implemented (Phase 1)',
  };
}
