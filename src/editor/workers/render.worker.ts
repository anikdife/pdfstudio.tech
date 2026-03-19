// Phase 1 placeholder render worker.
// NOTE: Not wired up by default. Keep minimal so it can compile.

export type RenderWorkerMessage = { type: 'ping' };

self.onmessage = (ev: MessageEvent<RenderWorkerMessage>) => {
  if (ev.data?.type === 'ping') {
    self.postMessage({ ok: true });
  }
};
