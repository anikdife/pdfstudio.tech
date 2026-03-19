import { useMemo, useRef } from 'react';
import type { InkObj } from '../state/types';
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
  width: number;
  opacity: number;
};

export function useInkTool(params: Params) {
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const updateOverlayObject = useDocumentStore((s) => s.updateOverlayObject);

  const activeIdRef = useRef<string | null>(null);

  return useMemo(() => {
    if (!params.enabled) return {};

    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = params.getCanvasRect();
        if (!rect) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        const pt = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          params.zoom,
          params.pan,
          params.pageRotation,
          params.pageSize,
        );

        const id = createId('ink');
        const obj: InkObj = {
          id,
          type: 'ink',
          color: params.color,
          width: params.width,
          opacity: params.opacity,
          points: [pt],
        };

        activeIdRef.current = id;
        addOverlayObject(params.pageIndex, obj);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const id = activeIdRef.current;
        if (!id) return;
        const rect = params.getCanvasRect();
        if (!rect) return;

        const pt = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          params.zoom,
          params.pan,
          params.pageRotation,
          params.pageSize,
        );

        // Phase 1: simple append via read-modify-write.
        const doc = useDocumentStore.getState().doc;
        const page = doc?.overlays[params.pageIndex];
        const before = page?.objects.find((o) => o.id === id);
        if (!before || before.type !== 'ink') return;

        updateOverlayObject(params.pageIndex, id, {
          points: [...before.points, pt],
        } as any);
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
    params.width,
    params.opacity,
    addOverlayObject,
    updateOverlayObject,
  ]);
}
