import { useMemo, useRef } from 'react';
import type { HighlightObj } from '../state/types';
import { createId } from '../util/ids';
import { screenToPage } from '../util/coords';
import { useDocumentStore } from '../state/documentStore';

type Params = {
  enabled: boolean;
  pageIndex: number;
  pageSize: { w: number; h: number };
  pageRotation: 0 | 90 | 180 | 270;
  zoom: number;
  pan: { x: number; y: number };
  getCanvasRect: () => DOMRect | null;
  color: string;
  opacity: number;
};

export function useHighlightTool(params: Params) {
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const updateOverlayObject = useDocumentStore((s) => s.updateOverlayObject);
  const activeIdRef = useRef<string | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return useMemo(() => {
    if (!params.enabled) return {};

    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = params.getCanvasRect();
        if (!rect) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        const p0 = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          params.zoom,
          params.pan,
          params.pageRotation,
          params.pageSize,
        );

        const id = createId('hl');
        const obj: HighlightObj = {
          id,
          type: 'highlight',
          color: params.color,
          opacity: params.opacity,
          rect: { x: p0.x, y: p0.y, w: 0, h: 0 },
        };

        activeIdRef.current = id;
        startRef.current = p0;
        addOverlayObject(params.pageIndex, obj);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const id = activeIdRef.current;
        const start = startRef.current;
        if (!id || !start) return;

        const rect = params.getCanvasRect();
        if (!rect) return;
        const p1 = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          params.zoom,
          params.pan,
          params.pageRotation,
          params.pageSize,
        );

        const x0 = Math.min(start.x, p1.x);
        const y0 = Math.min(start.y, p1.y);
        const w = Math.abs(p1.x - start.x);
        const h = Math.abs(p1.y - start.y);

        updateOverlayObject(params.pageIndex, id, { rect: { x: x0, y: y0, w, h } } as any);
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (activeIdRef.current) {
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }
        activeIdRef.current = null;
        startRef.current = null;
      },
    };
  }, [
    params.enabled,
    params.pageIndex,
    params.pageSize,
    params.pageRotation,
    params.zoom,
    params.pan,
    params.getCanvasRect,
    params.color,
    params.opacity,
    addOverlayObject,
    updateOverlayObject,
  ]);
}
