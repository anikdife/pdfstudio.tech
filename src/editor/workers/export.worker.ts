// Phase 1 placeholder export worker.
// NOTE: Not wired up by default. Keep minimal so it can compile.

export type ExportWorkerMessage = { type: 'ping' };

self.onmessage = (ev: MessageEvent<ExportWorkerMessage>) => {
  if (ev.data?.type === 'ping') {
    self.postMessage({ ok: true });
  }
};
