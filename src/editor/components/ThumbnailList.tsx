import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../state/documentStore';
import { useUiStore } from '../state/uiStore';
import { getPdfDocument } from '../pdf/render';
import { clearEditorThumbnailCache, getEditorThumbnailDataUrlCached } from '../pdf/thumbnails';
import type { OverlayObject } from '../state/types';

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    try {
      window.requestAnimationFrame(() => resolve());
    } catch {
      window.setTimeout(() => resolve(), 0);
    }
  });
}

function nextIdle(timeoutMs: number = 1250): Promise<void> {
  return new Promise((resolve) => {
    const w = window as any;
    const ric = w?.requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
    if (typeof ric === 'function') {
      try {
        ric(() => resolve(), { timeout: timeoutMs });
        return;
      } catch {
        // fall through
      }
    }
    window.setTimeout(() => resolve(), 0);
  });
}

function overlaySigForThumb(objects: OverlayObject[]): string {
  // Keep this stable + lightweight. We only need to know “something changed”
  // to refresh the thumbnail; we don't need a full hash of all points.
  const parts: string[] = [];
  for (const o of objects) {
    if (!o) continue;
    switch ((o as any).type) {
      case 'pageBorder': {
        const b: any = o;
        parts.push(`b:${b.id}:${String(b.style ?? '')}:${String(b.color ?? '')}:${String(b.strokeWidth ?? '')}`);
        break;
      }
      case 'ink': {
        const ink: any = o;
        const pts = Array.isArray(ink.points) ? ink.points : [];
        const last = pts.length ? pts[pts.length - 1] : null;
        const lx = last ? Math.round(Number(last.x ?? 0) * 10) / 10 : 0;
        const ly = last ? Math.round(Number(last.y ?? 0) * 10) / 10 : 0;
        parts.push(
          `i:${ink.id}:${String(ink.color ?? '')}:${String(ink.width ?? '')}:${String(ink.opacity ?? '')}:${pts.length}:${lx}:${ly}`,
        );
        break;
      }
      case 'highlight': {
        const h: any = o;
        const r: any = h.rect ?? {};
        parts.push(
          `h:${h.id}:${String(h.color ?? '')}:${String(h.opacity ?? '')}:${Math.round(Number(r.x ?? 0))}:${Math.round(
            Number(r.y ?? 0),
          )}:${Math.round(Number(r.w ?? 0))}:${Math.round(Number(r.h ?? 0))}`,
        );
        break;
      }
      case 'text': {
        const t: any = o;
        const r: any = t.rect ?? {};
        parts.push(
          `t:${t.id}:${Math.round(Number(r.x ?? 0))}:${Math.round(Number(r.y ?? 0))}:${Math.round(
            Number(r.w ?? 0),
          )}:${Math.round(Number(r.h ?? 0))}:${String(t.color ?? '')}:${String(t.fontSize ?? '')}:${String(
            (t.text ?? '').length,
          )}`,
        );
        break;
      }
      case 'list': {
        const l: any = o;
        const r: any = l.rect ?? {};
        const items = Array.isArray(l.items) ? l.items : [];
        const len = items.reduce((acc: number, it: any) => acc + String(it?.text ?? '').length, 0);
        parts.push(
          `l:${l.id}:${Math.round(Number(r.x ?? 0))}:${Math.round(Number(r.y ?? 0))}:${Math.round(
            Number(r.w ?? 0),
          )}:${Math.round(Number(r.h ?? 0))}:${String(l.color ?? '')}:${String(l.fontSize ?? '')}:${items.length}:${len}`,
        );
        break;
      }
      case 'image': {
        const im: any = o;
        const r: any = im.rect ?? {};
        parts.push(
          `im:${im.id}:${Math.round(Number(r.x ?? 0))}:${Math.round(Number(r.y ?? 0))}:${Math.round(
            Number(r.w ?? 0),
          )}:${Math.round(Number(r.h ?? 0))}:${String(im.opacity ?? '')}:${String(im.maskId ?? '')}`,
        );
        break;
      }
      default:
        parts.push(`o:${(o as any).type}:${(o as any).id}`);
        break;
    }
  }
  return parts.join('|');
}

type DockThumbProps = {
  editorIndex: number;
  originalIndex: number;
  isActive: boolean;
  isSelected: boolean;
  distance: number;
  src: string | undefined;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  setRef: (el: HTMLDivElement | null) => void;
};

const DockThumb = memo(function DockThumb(props: DockThumbProps) {
  const scale = props.isActive ? 1.0 : props.distance === 1 ? 0.8 : 0.6;
  const opacity = props.isActive ? 1 : props.distance === 1 ? 0.9 : 0.75;

  return (
    <div
      ref={props.setRef}
      className={props.isActive || props.isSelected ? 'thumbItem active dockThumb' : 'thumbItem dockThumb'}
      draggable
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onClick={props.onClick}
      title={`Page ${props.editorIndex + 1}`}
      style={{
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div className="thumbLabel">{props.editorIndex + 1}</div>
      <div className={props.isActive ? 'thumbImgWrap hi' : 'thumbImgWrap lo'}>
        {props.src ? <img src={props.src} alt={`Page ${props.editorIndex + 1}`} /> : <div className="thumbPlaceholder" />}
      </div>
    </div>
  );
});

export function ThumbnailList() {
  const doc = useDocumentStore((s) => s.doc);
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const setActivePage = useDocumentStore((s) => s.setActivePage);
  const reorderPages = useDocumentStore((s) => s.reorderPages);

  const listRef = useRef<HTMLDivElement | null>(null);
  const lastUserScrollAtRef = useRef<number>(0);
  const lastFocusAtRef = useRef<number>(0);

  useEffect(() => {
    const onFocus = () => {
      lastFocusAtRef.current = Date.now();
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') lastFocusAtRef.current = Date.now();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Avoid retriggering expensive thumbnail generation work when the document object is
  // recreated for unrelated edits (e.g. overlays). We key off stable signatures/values.
  const pageOrderSig = useMemo(() => {
    if (!doc) return '';
    return (doc.pageOrder ?? []).join(',');
  }, [doc]);

  const pageRotationSig = useMemo(() => {
    if (!doc) return '';
    return (doc.pageRotation ?? []).join(',');
  }, [doc]);

  const activeOriginalIndex = useMemo(() => {
    if (!doc) return activePageIndex;
    return doc.pageOrder?.[activePageIndex] ?? activePageIndex;
  }, [doc, activePageIndex]);

  const activeRotation = useMemo(() => {
    if (!doc) return 0;
    return (doc.pageRotation?.[activePageIndex] ?? 0) as any;
  }, [doc, activePageIndex]);

  // NOTE:
  // We intentionally do NOT key thumbnail regeneration off doc.meta.updatedAt.
  // During ink/highlight strokes that value changes very frequently and can cause
  // a render/effect/update storm (and, in some cases, React's max update depth error).
  // For the border feature, we only need to invalidate thumbnails when page borders change.
  const borderSig = useMemo(() => {
    if (!doc) return '';
    const parts: string[] = [];
    for (let i = 0; i < (doc.pageCount ?? 0); i++) {
      const b = (doc.overlays[i]?.objects ?? []).find((o) => (o as any).type === 'pageBorder') as any;
      if (!b) {
        parts.push(`${i}:none`);
        continue;
      }
      parts.push(`${i}:${String(b.style ?? '')}:${String(b.color ?? '')}:${String(b.strokeWidth ?? '')}`);
    }
    return parts.join('|');
  }, [doc]);

  const activeOverlayObjects = useMemo(() => {
    if (!doc) return [] as OverlayObject[];
    return (doc.overlays[activePageIndex]?.objects ?? []) as OverlayObject[];
  }, [doc, activePageIndex]);

  const activeOverlaySig = useMemo(() => {
    return overlaySigForThumb(activeOverlayObjects);
  }, [activeOverlayObjects]);

  const selectedPageIndices = useUiStore((s) => s.selectedPageIndices);
  const pageSelectionAnchor = useUiStore((s) => s.pageSelectionAnchor);
  const setSelectedPageIndices = useUiStore((s) => s.setSelectedPageIndices);
  const setPageSelectionAnchor = useUiStore((s) => s.setPageSelectionAnchor);
  const togglePageSelected = useUiStore((s) => s.togglePageSelected);

  const [thumbsLow, setThumbsLow] = useState<Record<number, string>>({});
  const [thumbsHigh, setThumbsHigh] = useState<Record<number, string>>({});

  const pageCount = doc?.pageCount ?? 0;

  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const setItemRef = (editorIndex: number) => (el: HTMLDivElement | null) => {
    itemRefs.current[editorIndex] = el;
  };

  // Only clear the global thumbnail cache when the underlying PDF bytes change.
  // Reorders / overlay edits should be able to reuse cached renders.
  const prevBasePdfBytesRef = useRef<Uint8Array | null>(null);
  useEffect(() => {
    if (!doc?.basePdfBytes) return;
    if (prevBasePdfBytesRef.current === doc.basePdfBytes) return;
    prevBasePdfBytesRef.current = doc.basePdfBytes;
    clearEditorThumbnailCache();
  }, [doc?.basePdfBytes]);

  useEffect(() => {
    let cancelled = false;
    setThumbsLow({});
    setThumbsHigh({});

    async function run() {
      if (!doc?.basePdfBytes) return;
      const basePdfBytes = doc.basePdfBytes;
      const pdf = await getPdfDocument(basePdfBytes);

      const count = doc.pageCount;

      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const flushEvery = 4;
      // Keep the editor responsive: generate only a couple immediately, then defer the rest.
      const initialCount = Math.max(0, Math.min(count, 2));

      const flush = (updates: Record<number, string>) => {
        const keys = Object.keys(updates);
        if (keys.length === 0) return;
        setThumbsLow((prev) => ({ ...prev, ...updates }));
      };

      const renderLow = async (editorIndex: number): Promise<string | null> => {
        const originalIndex = doc.pageOrder[editorIndex] ?? editorIndex;
        const rotation = (doc.pageRotation[editorIndex] ?? 0) as any;
        const overlayObjects = (doc.overlays[editorIndex]?.objects ?? []) as OverlayObject[];

        // Invalidate cached thumbnails when page borders change.
        const lowKey = `doc:${basePdfBytes.byteLength}:${borderSig}:${originalIndex}:${rotation}:low`;
        return await getEditorThumbnailDataUrlCached({
          pdf,
          cacheKey: lowKey,
          originalPageIndex: originalIndex,
          pageRotation: rotation,
          overlayObjects,
          quality: 'low',
        });
      };

      // Phase 1: generate just the first few thumbnails quickly.
      // This keeps initial PDF open responsive (rendering every thumbnail can easily dominate CPU).
      let pending: Record<number, string> = {};
      for (let editorIndex = 0; editorIndex < initialCount; editorIndex++) {
        if (cancelled) return;
        try {
          // Don't compete with the main page render or user interactions.
          // eslint-disable-next-line no-await-in-loop
          await nextIdle();
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          const url = await renderLow(editorIndex);
          if (cancelled) return;
          if (url) pending[editorIndex] = url;
          if (Object.keys(pending).length >= flushEvery) {
            flush(pending);
            pending = {};
            // Yield so the main page render/UI work isn't starved.
            // eslint-disable-next-line no-await-in-loop
            await nextAnimationFrame();
          }
        } catch {
          // ignore individual thumbnail failures
        }
      }
      flush(pending);
      pending = {};

      // Phase 2: fill the rest in the background during idle time.
      for (let editorIndex = initialCount; editorIndex < count; editorIndex++) {
        if (cancelled) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          await nextIdle();
          if (cancelled) return;

          // eslint-disable-next-line no-await-in-loop
          const url = await renderLow(editorIndex);
          if (cancelled) return;
          if (url) pending[editorIndex] = url;
          if (Object.keys(pending).length >= flushEvery) {
            flush(pending);
            pending = {};
          }
        } catch {
          // ignore
        }
      }
      flush(pending);

      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = t1 - t0;
      if (dt > 2500) {
        try {
          if (import.meta.env.DEV && window.localStorage?.getItem('xpdf:debug:verbose') === '1') {
            // eslint-disable-next-line no-console
            console.warn('[xpdf:perf] thumbnails:low total(ms)=', Math.round(dt), { pages: count });
          }
        } catch {
          // ignore
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [doc?.basePdfBytes, doc?.pageCount, pageOrderSig, pageRotationSig, borderSig]);

  // Debounced refresh for the active page thumbnail when overlays change (e.g. ink strokes).
  // This avoids re-rendering *all* thumbnails on every stroke, but keeps the active thumb responsive.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      async function run() {
        if (!doc?.basePdfBytes) return;
        if (activePageIndex < 0 || activePageIndex >= (doc.pageCount ?? 0)) return;

        try {
          // Avoid competing with interactive actions (e.g. placing/adding objects).
          await nextIdle();
          if (cancelled) return;

          const pdf = await getPdfDocument(doc.basePdfBytes);
          const originalIndex = activeOriginalIndex;
          const rotation = activeRotation;
          const overlayObjects = (doc.overlays[activePageIndex]?.objects ?? []) as OverlayObject[];

          // Use low quality here: overlay edits can happen frequently and high-quality
          // thumb renders can starve the main editor UI.
          const hiKey = `doc:${doc.basePdfBytes.byteLength}:active:${activePageIndex}:${activeOverlaySig}:${originalIndex}:${rotation}:low`;
          const url = await getEditorThumbnailDataUrlCached({
            pdf,
            cacheKey: hiKey,
            originalPageIndex: originalIndex,
            pageRotation: rotation,
            overlayObjects,
            quality: 'low',
          });

          if (cancelled) return;
          setThumbsHigh((prev) => ({ ...prev, [activePageIndex]: url }));
          // Also update the low thumb for this page so it remains accurate when it becomes inactive.
          setThumbsLow((prev) => ({ ...prev, [activePageIndex]: url }));
        } catch {
          // ignore
        }
      }
      run();
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc?.basePdfBytes, doc?.pageCount, activePageIndex, activeOriginalIndex, activeRotation, activeOverlaySig]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!doc?.basePdfBytes) return;
      if (activePageIndex < 0 || activePageIndex >= (doc.pageCount ?? 0)) return;

      // Avoid competing with the first visible page render.
      await nextIdle();
      if (cancelled) return;

      const pdf = await getPdfDocument(doc.basePdfBytes);
      const originalIndex = activeOriginalIndex;
      const rotation = activeRotation;
      const overlayObjects = (doc.overlays[activePageIndex]?.objects ?? []) as OverlayObject[];

      // Invalidate cached thumbnails when page borders change.
      const hiKey = `doc:${doc.basePdfBytes.byteLength}:${borderSig}:${originalIndex}:${rotation}:high`;
      const url = await getEditorThumbnailDataUrlCached({
        pdf,
        cacheKey: hiKey,
        originalPageIndex: originalIndex,
        pageRotation: rotation,
        overlayObjects,
        quality: 'high',
      });

      if (cancelled) return;
      setThumbsHigh((prev) => ({ ...prev, [activePageIndex]: url }));
    }
    run().catch(() => {
      // ignore
    });
    return () => {
      cancelled = true;
    };
  }, [doc?.basePdfBytes, doc?.pageCount, activePageIndex, activeOriginalIndex, activeRotation, borderSig]);

  useEffect(() => {
    const listEl = listRef.current;
    const el = itemRefs.current[activePageIndex];
    if (!listEl || !el) return;

    // If the browser tab was just re-activated, avoid "helpful" auto-scrolling.
    // This preserves the user's manual scroll position in the thumbnail dock.
    const now = Date.now();
    if (now - lastFocusAtRef.current < 650) return;

    try {
      const containerRect = listEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const margin = 14;
      const fullyVisible =
        elRect.top >= containerRect.top + margin && elRect.bottom <= containerRect.bottom - margin;
      if (fullyVisible) return;

      // Less jumpy than centering, and won't move the list if it's already in view.
      // If the user just scrolled the thumb list, don't animate.
      const behavior = now - lastUserScrollAtRef.current < 280 ? 'auto' : 'smooth';
      el.scrollIntoView({ block: 'nearest', behavior } as ScrollIntoViewOptions);
    } catch {
      // ignore
    }
  }, [activePageIndex]);

  const items = useMemo(() => {
    if (!doc) return [] as Array<{ editorIndex: number; originalIndex: number }>;
    return doc.pageOrder.map((originalIndex, editorIndex) => ({ editorIndex, originalIndex }));
  }, [doc]);

  const [dragFrom, setDragFrom] = useState<number | null>(null);

  if (!doc?.basePdfBytes) {
    return <div style={{ padding: 10 }} className="muted">Open a PDF to see pages.</div>;
  }

  return (
    <div
      className="thumbList dockList"
      ref={listRef}
      onScroll={() => {
        lastUserScrollAtRef.current = Date.now();
      }}
    >
      {items.map(({ editorIndex, originalIndex }) => {
        const isActive = editorIndex === activePageIndex;
        const isSelected = selectedPageIndices.includes(editorIndex);
        const distance = Math.abs(editorIndex - activePageIndex);

        const src = isActive ? (thumbsHigh[editorIndex] ?? thumbsLow[editorIndex]) : thumbsLow[editorIndex];

        return (
          <DockThumb
            key={`${editorIndex}-${originalIndex}`}
            editorIndex={editorIndex}
            originalIndex={originalIndex}
            isActive={isActive}
            isSelected={isSelected}
            distance={distance}
            src={src}
            setRef={setItemRef(editorIndex)}
            onDragStart={(e) => {
              setDragFrom(editorIndex);
              try {
                e.dataTransfer.setData('text/plain', String(editorIndex));
              } catch {
                // ignore
              }
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom == null) return;
              reorderPages(dragFrom, editorIndex);
              // Move selection indices with the page reorder.
              setSelectedPageIndices((() => {
                const sel = selectedPageIndices;
                if (sel.length === 0) return sel;
                const moved = new Set<number>();
                for (const i of sel) {
                  if (i === dragFrom) moved.add(editorIndex);
                  else if (dragFrom < editorIndex && i > dragFrom && i <= editorIndex) moved.add(i - 1);
                  else if (dragFrom > editorIndex && i >= editorIndex && i < dragFrom) moved.add(i + 1);
                  else moved.add(i);
                }
                return Array.from(moved).sort((a, b) => a - b);
              })());
              setDragFrom(null);
            }}
            onClick={(e) => {
              const total = doc?.pageCount ?? 0;
              const idx = editorIndex;

              // Always update active page
              setActivePage(idx);

              if (!total) return;

              if (e.shiftKey && pageSelectionAnchor != null) {
                const a = Math.max(0, Math.min(pageSelectionAnchor, total - 1));
                const b = Math.max(0, Math.min(idx, total - 1));
                const start = Math.min(a, b);
                const end = Math.max(a, b);
                const next = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                setSelectedPageIndices(next);
                return;
              }

              if (e.metaKey || e.ctrlKey) {
                togglePageSelected(idx);
                setPageSelectionAnchor(idx);
                return;
              }

              // Single click: select only this page
              setSelectedPageIndices([idx]);
              setPageSelectionAnchor(idx);
            }}
          />
        );
      })}
    </div>
  );
}
