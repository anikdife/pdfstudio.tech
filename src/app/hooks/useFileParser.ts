import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ParserResult, WorkerParseRequest, WorkerParseResponse } from '../../workers/fileProcessorTypes';

function getExt(fileName: string) {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

export type UseFileParserApi = {
  parseFile: (file: File) => Promise<ParserResult>;
};

export function useFileParser(): UseFileParserApi {
  const workerRef = useRef<Worker | null>(null);
  const initPromiseRef = useRef<Promise<Worker> | null>(null);
  const workerErrorRef = useRef<Error | null>(null);
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (r: ParserResult) => void;
        reject: (e: Error) => void;
      }
    >(),
  );

  const initWorker = useCallback((): Promise<Worker> => {
    if (workerRef.current) return Promise.resolve(workerRef.current);
    if (workerErrorRef.current) return Promise.reject(workerErrorRef.current);
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = new Promise<Worker>((resolve, reject) => {
      try {
        // Classic worker so we can use importScripts for libs in /public/scripts/*.
        const worker = new Worker(new URL('../../workers/fileProcessor.worker.ts', import.meta.url), { type: 'classic' });
        workerRef.current = worker;
        workerErrorRef.current = null;

        const crashAllPending = (err: Error) => {
          workerErrorRef.current = err;
          for (const [id, p] of pendingRef.current.entries()) {
            pendingRef.current.delete(id);
            p.reject(err);
          }
          try {
            worker.terminate();
          } catch {
            // ignore
          }
          if (workerRef.current === worker) workerRef.current = null;
          if (initPromiseRef.current) initPromiseRef.current = null;
        };

        worker.onerror = (e) => {
          // Reject all pending promises to avoid a "nothing happens" hang.
          crashAllPending(new Error(`Parser worker crashed: ${String((e as any)?.message ?? 'unknown error')}`));
        };

        worker.onmessageerror = () => {
          crashAllPending(new Error('Parser worker message error'));
        };

        worker.onmessage = (ev: MessageEvent<WorkerParseResponse>) => {
          const msg = ev.data;
          if (!msg) return;

          const pending = pendingRef.current.get(msg.requestId);
          if (!pending) return;

          if (msg.type === 'result') {
            pendingRef.current.delete(msg.requestId);
            pending.resolve(msg.result);
            return;
          }

          if (msg.type === 'error') {
            pendingRef.current.delete(msg.requestId);
            const err = new Error(msg.error.message);
            (err as any).stack = msg.error.stack;
            pending.reject(err);
          }
        };

        resolve(worker);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        workerErrorRef.current = err;
        initPromiseRef.current = null;
        reject(err);
      }
    });

    return initPromiseRef.current;
  }, []);

  useEffect(() => {
    // Prewarm so the first click feels instant, but keep parseFile safe if a user clicks immediately.
    void initWorker().catch(() => {
      // ignore (we surface the error on parseFile)
    });

    return () => {
      // Reject pending promises to avoid hung UI.
      for (const [id, p] of pendingRef.current.entries()) {
        pendingRef.current.delete(id);
        p.reject(new Error('Parser worker terminated'));
      }
      try {
        workerRef.current?.terminate();
      } catch {
        // ignore
      }
      workerRef.current = null;
      initPromiseRef.current = null;
      workerErrorRef.current = null;
    };
  }, [initWorker]);

  const parseFile = useCallback(async (file: File) => {
    const worker = await initWorker();

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const buffer = await file.arrayBuffer();

    const req: WorkerParseRequest = {
      type: 'parse',
      requestId,
      fileName: file.name,
      extension: getExt(file.name),
      buffer,
    };

    const p = new Promise<ParserResult>((resolve, reject) => {
      pendingRef.current.set(requestId, { resolve, reject });
    });

    // Safety net: if the worker fails before emitting onerror (or errors before we had pending),
    // avoid an infinite spinner.
    // DOCX/XLSX parsing should usually finish quickly. If it doesn't, it's often because
    // the worker failed to load/execute (classic worker syntax errors can otherwise look
    // like a silent no-op). Fail fast so the user gets feedback.
    const timeoutMs = 20_000;
    const t = window.setTimeout(() => {
      const pending = pendingRef.current.get(requestId);
      if (!pending) return;
      pendingRef.current.delete(requestId);
      pending.reject(new Error('Timed out while parsing file (check DevTools console for worker errors)'));
    }, timeoutMs);

    const pWithTimeout = p.finally(() => window.clearTimeout(t));

    worker.postMessage(req, [buffer]);
    return pWithTimeout;
  }, [initWorker]);

  return useMemo(() => ({ parseFile }), [parseFile]);
}
