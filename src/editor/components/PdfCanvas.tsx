import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../state/documentStore';
import { getPdfDocument } from '../pdf/render';
import { renderPageToCanvas } from '../pdf/pdfjs';
import { OverlayLayer } from './OverlayLayer';
import { selectActivePage } from '../state/selectors';
import { useUiStore } from '../state/uiStore';
import { cropToViewRect, viewSizeForRotation } from '../pageops/crop';

export function PdfCanvas() {
  const docModel = useDocumentStore((s) => s.doc);
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const zoom = useDocumentStore((s) => s.zoom);
  const setActivePage = useDocumentStore((s) => s.setActivePage);
  // Phase 1: pan state exists in the store but is not applied visually yet.
  const pan = { x: 0, y: 0 };

  const cropMode = useUiStore((s) => s.cropMode);
  const cropDraftByPage = useUiStore((s) => s.cropDraftByPage);
  const filePickerOpen = useUiStore((s) => s.filePickerOpen);

  const active = useMemo(
    () => selectActivePage(docModel, activePageIndex),
    [docModel, activePageIndex],
  );

  const clipStyle = useMemo(() => {
    if (!active || !docModel) return undefined as any;
    const pageW = active.size?.w ?? 0;
    const pageH = active.size?.h ?? 0;
    const rotation = active.rotation;
    const crop = cropMode
      ? (cropDraftByPage[active.pageIndex] ?? (docModel.pageCrop?.[active.pageIndex] ?? null))
      : (docModel.pageCrop?.[active.pageIndex] ?? null);

    if (!crop) return undefined as any;
    const view = viewSizeForRotation(pageW, pageH, rotation);
    const rect = cropToViewRect(crop as any, pageW, pageH, rotation);
    const insetTop = rect.top * zoom;
    const insetLeft = rect.left * zoom;
    const insetRight = (view.w - rect.right) * zoom;
    const insetBottom = (view.h - rect.bottom) * zoom;

    return {
      clipPath: `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px)`,
    };
  }, [active, cropDraftByPage, cropMode, docModel, zoom]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const pdfDocRef = useRef<any>(null);
  const [pdfDocVersion, setPdfDocVersion] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  const renderDelayTimerRef = useRef<number | null>(null);

  const loadT0Ref = useRef<number>(0);
  const loadDocIdRef = useRef<string | null>(null);
  const firstPaintKeyRef = useRef<string>('');
  const lastProgressiveKeyRef = useRef<string>('');
  const pdfLoadReqIdRef = useRef(0);

  const isVerboseDebug = (() => {
    if (!import.meta.env.DEV) return false;
    try {
      return window.localStorage?.getItem('xpdf:debug:verbose') === '1';
    } catch {
      return false;
    }
  })();

  const dbg = (...args: any[]) => {
    if (!isVerboseDebug) return;
    try {
      // eslint-disable-next-line no-console
      console.log(...args);
    } catch {
      // ignore
    }
  };

  const emitPerf = (name: string, ms: number, extra?: any) => {
    if (!import.meta.env.DEV) return;
    try {
      window.dispatchEvent(
        new CustomEvent('xpdf:perf', {
          detail: { name, ms: Math.round(ms), extra: extra ?? null },
        }),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    dbg('[xpdf:debug] pdfCanvas:mounted');
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;
    dbg('[xpdf:debug] pdfCanvas:pdfDoc:set', { pages: (pdfDoc as any)?.numPages });
  }, [pdfDoc]);

  const lastFitDocIdRef = useRef<string | null>(null);
  const fitDelayUntilRef = useRef<number>(0);
  const fitDelayDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Fit-page (capped at 100%) when a *new* document is loaded.
    // This avoids resetting zoom for in-place edits (insert/merge pages) where doc id stays the same.
    if (!docModel?.id) return;
    if (!active?.size) return;
    if (lastFitDocIdRef.current === docModel.id) return;

    let cancelled = false;
    const docId = docModel.id;

    const stageEl = stageRef.current;
    const wrapEl = stageEl?.parentElement;
    if (!stageEl || !wrapEl) return;

    // Delay the first render slightly so we don't render at zoom=1 and then immediately rerender at the fitted zoom.
    // Only do this when the container has a measurable size; otherwise the delay can become a “never paints” footgun
    // when layout hasn't settled yet.
    if (wrapEl.clientWidth >= 80 && wrapEl.clientHeight >= 80) {
      fitDelayDocIdRef.current = docModel.id;
      try {
        fitDelayUntilRef.current = performance.now() + 220;
      } catch {
        fitDelayUntilRef.current = Date.now() + 220;
      }
    } else {
      fitDelayDocIdRef.current = null;
      fitDelayUntilRef.current = 0;
    }

    const tryFit = () => {
      if (cancelled) return false;

      // If layout hasn't settled yet, client sizes can be 0 and we'd clamp to 0.25 ("thumbnail").
      // Only apply fit when we have a real viewport.
      if (wrapEl.clientWidth < 80 || wrapEl.clientHeight < 80) return false;

      const style = window.getComputedStyle(stageEl);
      const padLeft = Number.parseFloat(style.paddingLeft || '0') || 0;
      const padRight = Number.parseFloat(style.paddingRight || '0') || 0;
      const padTop = Number.parseFloat(style.paddingTop || '0') || 0;
      const padBottom = Number.parseFloat(style.paddingBottom || '0') || 0;

      const availW = wrapEl.clientWidth - padLeft - padRight;
      const availH = wrapEl.clientHeight - padTop - padBottom;
      if (availW < 50 || availH < 50) return false;

      const view = viewSizeForRotation(active.size.w ?? 0, active.size.h ?? 0, active.rotation);
      const pageW = Math.max(1, view.w);
      const pageH = Math.max(1, view.h);

      const fit = Math.min(availW / pageW, availH / pageH);
      if (!Number.isFinite(fit) || fit <= 0) return false;

      const nextZoom = Math.max(0.25, Math.min(1, Math.min(3, fit)));

      // Only mark as "fitted" after we successfully computed from a real container.
      lastFitDocIdRef.current = docId;
      useDocumentStore.setState({ zoom: nextZoom });

      // Fit is applied; allow render immediately.
      fitDelayUntilRef.current = 0;
      fitDelayDocIdRef.current = null;

      if (renderDelayTimerRef.current != null) {
        try {
          window.clearTimeout(renderDelayTimerRef.current);
        } catch {
          // ignore
        }
        renderDelayTimerRef.current = null;
      }

      // Helps avoid landing mid-scroll after loading.
      wrapEl.scrollTop = 0;
      wrapEl.scrollLeft = 0;
      return true;
    };

    // Retry for a few frames to allow panels/layout to settle.
    let raf = 0;
    let tries = 0;
    const maxTries = 24;
    const loop = () => {
      if (cancelled) return;
      if (lastFitDocIdRef.current === docId) return;
      if (tryFit()) return;
      tries += 1;
      if (tries < maxTries) raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    // Also watch container size changes (e.g. panels opening/closing, initial layout).
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (lastFitDocIdRef.current === docId) return;
          tryFit();
        })
      : null;
    ro?.observe(wrapEl);

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();

      if (renderDelayTimerRef.current != null) {
        try {
          window.clearTimeout(renderDelayTimerRef.current);
        } catch {
          // ignore
        }
        renderDelayTimerRef.current = null;
      }
    };
  }, [docModel?.id, active?.size?.w, active?.size?.h, active?.rotation]);

  const wheelAccumRef = useRef(0);
  const lastWheelNavRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const reqId = pdfLoadReqIdRef.current + 1;
    pdfLoadReqIdRef.current = reqId;
    pdfDocRef.current = null;
    setPdfDoc(null);
    setRenderError(null);

    let pendingTimer: number | null = null;

    if (!docModel?.basePdfBytes) return;

    dbg('[xpdf:debug] pdfCanvas:basePdfBytes', {
      docId: docModel.id,
      bytes: docModel.basePdfBytes.byteLength,
      pages: docModel.pageCount,
    });

    if (import.meta.env.DEV) {
      loadDocIdRef.current = docModel.id ?? null;
      try {
        loadT0Ref.current = performance.now();
      } catch {
        loadT0Ref.current = Date.now();
      }
      firstPaintKeyRef.current = '';
    }

    dbg('[xpdf:debug] pdfCanvas:getPdfDocument:start', {
      reqId,
      docId: docModel.id,
      bytes: docModel.basePdfBytes.byteLength,
    });

    if (isVerboseDebug) {
      dbg('[xpdf:debug] pdfCanvas:getPdfDocument:watchdog:set', { reqId, ms: 1000 });
      pendingTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (pdfLoadReqIdRef.current !== reqId) return;
        dbg('[xpdf:debug] pdfCanvas:getPdfDocument:pending', {
          reqId,
          docId: docModel.id,
          ms: 1000,
        });
      }, 1000);
    }

    getPdfDocument(docModel.basePdfBytes)
      .then((d) => {
        if (pendingTimer != null) {
          try {
            window.clearTimeout(pendingTimer);
          } catch {
            // ignore
          }
          pendingTimer = null;
        }
        if (cancelled) return;
        // Only apply if this is the latest request (handles React StrictMode effect re-runs).
        if (pdfLoadReqIdRef.current !== reqId) {
          dbg('[xpdf:debug] pdfCanvas:getPdfDocument:stale', { reqId, current: pdfLoadReqIdRef.current });
          return;
        }

        if (import.meta.env.DEV) {
          const t1 = (() => {
            try {
              return performance.now();
            } catch {
              return Date.now();
            }
          })();
          const dt = t1 - (loadT0Ref.current || t1);
          dbg('[xpdf:debug] perf:pdfDocReady(ms)', Math.round(dt), { pages: d?.numPages });
          emitPerf('pdfDocReady', dt, { pages: d?.numPages });
          dbg('[xpdf:debug] pdfCanvas:getPdfDocument:resolved', { reqId });
        }

        pdfDocRef.current = d;
        setPdfDoc(d);
        setPdfDocVersion((v) => v + 1);

        dbg('[xpdf:debug] pdfCanvas:pdfDoc:stored', { pages: (d as any)?.numPages });
      })
      .catch((e) => {
        if (pendingTimer != null) {
          try {
            window.clearTimeout(pendingTimer);
          } catch {
            // ignore
          }
          pendingTimer = null;
        }
        if (cancelled) return;
        dbg('[xpdf:debug] pdfCanvas:getPdfDocument:error', e);
        if (pdfLoadReqIdRef.current !== reqId) return;
        setRenderError(e instanceof Error ? e.message : 'Failed to load PDF');
      });

    return () => {
      cancelled = true;
      const cur = useDocumentStore.getState().doc;
      dbg('[xpdf:debug] pdfCanvas:getPdfDocument:cleanup', {
        reqId,
        currentDocId: cur?.id ?? null,
        currentHasBytes: !!cur?.basePdfBytes,
      });
      if (pendingTimer != null) {
        try {
          window.clearTimeout(pendingTimer);
        } catch {
          // ignore
        }
        pendingTimer = null;
      }
    };
  }, [docModel?.basePdfBytes]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      dbg('[xpdf:debug] pdfCanvas:render:tick', {
        hasPdfDoc: !!pdfDoc,
        hasCanvas: !!canvasRef.current,
        hasActive: !!active,
        hasBytes: !!docModel?.basePdfBytes,
        zoom,
        activePageIndex,
      });
      if (!canvasRef.current || !active) {
        dbg('[xpdf:debug] pdfCanvas:render:skip:missingPrereq', {
          hasCanvas: !!canvasRef.current,
          hasActive: !!active,
        });
        return;
      }
      if (!docModel?.basePdfBytes) {
        dbg('[xpdf:debug] pdfCanvas:render:skip:noPdf', {
          hasPdfDoc: !!pdfDoc,
          hasBytes: !!docModel?.basePdfBytes,
        });
        return;
      }

      // Render only once we have an actual PDFDocumentProxy in memory.
      // (Avoid awaiting getPdfDocument() here; this effect can be re-run rapidly due to zoom/layout updates,
      // and the in-flight await was getting cancelled before it could reach the render calls.)
      const pdf = pdfDocRef.current ?? pdfDoc;
      if (!pdf) {
        dbg('[xpdf:debug] pdfCanvas:render:skip:waitingForPdfDoc');
        return;
      }
      if (cancelled) return;

      dbg('[xpdf:debug] pdfCanvas:render:pdfReady', {
        pages: (pdf as any)?.numPages,
        page: active.originalPageIndex + 1,
        zoom: Math.round(zoom * 1000) / 1000,
        rotation: active.rotation,
      });

      if (!pdfDocRef.current) {
        pdfDocRef.current = pdf;
      }
      if (!pdfDoc) {
        try {
          setPdfDoc(pdf);
        } catch {
          // ignore
        }
      }

      // Note: we intentionally do NOT block rendering while initial auto-fit is running.
      // It can be tempting to “delay first paint” to avoid a double render (zoom=1 then zoom=fit),
      // but in practice it can create timing edge-cases where we never paint at all (especially in
      // dev/StrictMode or when layout measurements are briefly 0).
      // Fit-to-page will still adjust zoom and naturally trigger a rerender.

      // When basePdfBytes changes (insert/merge), we briefly have:
      // - `active` pointing at the new page
      // - `pdfDoc` still pointing at the previous PDFDocumentProxy
      // Calling `getPage()` in that window throws "Invalid page request".
      // Treat it as a transient state and wait for `pdfDoc` to reload.
      if (
        typeof pdf?.numPages === 'number' &&
        (active.originalPageIndex < 0 || active.originalPageIndex >= pdf.numPages)
      ) {
        dbg('[xpdf:debug] pdfCanvas:render:skip:invalidPage', {
          originalPageIndex: active.originalPageIndex,
          numPages: pdf.numPages,
        });
        setRenderError(null);
        return;
      }

      try {
        setRenderError(null);
        const canvas = canvasRef.current;
        const wantsProgressive = (window.devicePixelRatio || 1) > 1.25;
        const docId = docModel?.id ?? '';
        const progressiveKey = `${docId}:${active.originalPageIndex}:${active.rotation}:${Math.round(zoom * 1000)}`;

        dbg('[xpdf:debug] pdfCanvas:render:begin', {
          progressive: wantsProgressive,
          key: progressiveKey,
        });

        // Fast first paint on high-DPI screens.
        if (wantsProgressive && progressiveKey && lastProgressiveKeyRef.current !== progressiveKey) {
          lastProgressiveKeyRef.current = progressiveKey;
          await renderPageToCanvas(pdf, active.originalPageIndex, zoom, canvas, active.rotation, 1);
          if (cancelled) return;

          // Sharpen when the main thread is idle.
          const w = window as any;
          const ric = w?.requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
          const schedule = (cb: () => void) => {
            if (typeof ric === 'function') {
              try {
                ric(cb, { timeout: 1500 });
                return;
              } catch {
                // fall through
              }
            }
            window.setTimeout(cb, 0);
          };

          schedule(() => {
            if (cancelled) return;
            if (!canvasRef.current) return;
            const stillActive =
              (docModel?.id ?? '') === docId &&
              useDocumentStore.getState().activePageIndex === activePageIndex;
            if (!stillActive) return;

            void renderPageToCanvas(pdf, active.originalPageIndex, zoom, canvasRef.current, active.rotation);
          });
        } else {
          await renderPageToCanvas(pdf, active.originalPageIndex, zoom, canvas, active.rotation);
          if (cancelled) return;
        }

        dbg('[xpdf:debug] pdfCanvas:render:done', {
          css: { w: canvas.clientWidth, h: canvas.clientHeight },
          px: { w: canvas.width, h: canvas.height },
        });

        if (import.meta.env.DEV) {
          const key = progressiveKey;
          if (key && firstPaintKeyRef.current !== key) {
            firstPaintKeyRef.current = key;
            const t2 = (() => {
              try {
                return performance.now();
              } catch {
                return Date.now();
              }
            })();
            const dt = t2 - (loadT0Ref.current || t2);
            dbg('[xpdf:debug] perf:firstPagePaint(ms)', Math.round(dt), {
              page: active.originalPageIndex + 1,
              zoom: Math.round(zoom * 100) / 100,
              rotation: active.rotation,
            });
            emitPerf('firstPagePaint', dt, {
              page: active.originalPageIndex + 1,
              zoom: Math.round(zoom * 100) / 100,
              rotation: active.rotation,
            });
          }
        }
      } catch (e) {
        dbg('[xpdf:debug] pdfCanvas:render:error', e);
        if (cancelled) return;
        setRenderError(e instanceof Error ? e.message : 'Render failed');
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [docModel?.id, docModel?.basePdfBytes, pdfDocVersion, active?.originalPageIndex, active?.rotation, zoom]);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!docModel) return;
      if (docModel.pageCount <= 1) return;

      // Some browsers continue sending wheel events to the underlying page while the
      // OS file picker dialog is open, which can cause accidental page flips.
      if (filePickerOpen) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target && (target as any).isContentEditable);
      if (isTypingTarget) return;

      // Allow pinch-zoom / browser zoom gestures.
      if (e.ctrlKey || e.metaKey) return;

      // Only handle primarily-vertical gestures.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const now = performance.now();
      const dt = now - lastWheelNavRef.current;

      wheelAccumRef.current += e.deltaY;

      // Require intent (helps trackpads). Alt+wheel is a "power user" override.
      const threshold = e.altKey ? 80 : 140;
      if (Math.abs(wheelAccumRef.current) < threshold) return;
      if (dt < (e.altKey ? 160 : 220)) return;

      // Don't let the browser scroll the page while the cursor is over the editor.
      e.preventDefault();

      const dir = wheelAccumRef.current > 0 ? 1 : -1;
      wheelAccumRef.current = 0;
      lastWheelNavRef.current = now;

      const next = Math.max(0, Math.min(activePageIndex + dir, docModel.pageCount - 1));
      if (next !== activePageIndex) setActivePage(next);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [activePageIndex, docModel, filePickerOpen, setActivePage]);

  if (!docModel?.basePdfBytes) {
    return (
      <div className="emptyState">
        <div>No PDF loaded.</div>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="emptyState">
        <div className="error">{renderError}</div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="emptyState">
        <div>No pages.</div>
      </div>
    );
  }

  return (
    <div className="pdfStage" ref={stageRef}>
      <div
        className="pdfStack"
        style={clipStyle}
        ref={stackRef}
      >
        <canvas ref={canvasRef} className="pdfBaseCanvas" />
        <OverlayLayer
          baseCanvasRef={canvasRef}
          pageIndex={active.pageIndex}
          pageSize={active.size}
          pageRotation={active.rotation}
          zoom={zoom}
          pan={pan}
        />
      </div>
    </div>
  );
}
