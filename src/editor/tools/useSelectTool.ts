import { useMemo } from 'react';
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
};

export function useSelectTool(params: Params) {
  return useMemo(() => {
    if (!params.enabled) return {};

    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = params.getCanvasRect();
        if (!rect) return;

        const p = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          params.zoom,
          params.pan,
          params.pageRotation,
          params.pageSize,
        );

        const doc = useDocumentStore.getState().doc;
        const page = doc?.overlays[params.pageIndex];
        let hit: { id: string; type: string } | undefined;
        const objs = page?.objects ?? [];
        for (let i = objs.length - 1; i >= 0; i--) {
          const o = objs[i];
          if (o.type === 'ink') continue;
          if (o.type === 'highlight') {
            if (p.x >= o.rect.x && p.x <= o.rect.x + o.rect.w && p.y >= o.rect.y && p.y <= o.rect.y + o.rect.h) {
              hit = o;
              break;
            }
          }
          if (o.type === 'text') {
            if (p.x >= o.rect.x && p.x <= o.rect.x + o.rect.w && p.y >= o.rect.y && p.y <= o.rect.y + o.rect.h) {
              hit = o;
              break;
            }
          }
        }

        // Phase 1: just a stub.
        if (hit) {
          // eslint-disable-next-line no-console
          console.debug('Selected object', hit.id, hit.type);
        }
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
  ]);
}
