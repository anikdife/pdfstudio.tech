import { useMemo } from 'react';
import type { OverlayObject, TextObj } from '../state/types';
import { createId } from '../util/ids';
import { screenToPage } from '../util/coords';
import { useDocumentStore } from '../state/documentStore';
import { useUiStore } from '../state/uiStore';

type Params = {
  enabled: boolean;
  pageIndex: number;
  pageSize: { w: number; h: number };
  pageRotation: 0 | 90 | 180 | 270;
  zoom: number;
  pan: { x: number; y: number };
  getCanvasRect: () => DOMRect | null;
  color: string;
  fontSize: number;
};

function hitTestText(pageX: number, pageY: number, objects: OverlayObject[]): string | null {
  // topmost: last object wins
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type !== 'text') continue;
    const r = o.rect;
    if (pageX >= r.x && pageX <= r.x + r.w && pageY >= r.y && pageY <= r.y + r.h) return o.id;
  }
  return null;
}

export function useTextTool(params: Params) {
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const removeOverlayObject = useDocumentStore((s) => s.removeOverlayObject);
  const setSelectedTextId = useUiStore((s) => s.setSelectedTextId);
  const setEditingTextId = useUiStore((s) => s.setEditingTextId);

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

        // If clicked inside existing textbox, just select it.
        const doc = useDocumentStore.getState().doc;
        const objects = doc?.overlays[params.pageIndex]?.objects ?? [];
        const hitId = hitTestText(p.x, p.y, objects);
        if (hitId) {
          // Remove any empty textboxes created before this one (same page).
          const idx = objects.findIndex((o) => o.type === 'text' && o.id === hitId);
          if (idx > 0) {
            const toRemove: string[] = [];
            for (let i = 0; i < idx; i++) {
              const o = objects[i];
              if (o.type !== 'text') continue;
              const t = String((o as any).text ?? '').trim();
              if (t.length === 0) toRemove.push(o.id);
            }
            for (const id of toRemove) removeOverlayObject(params.pageIndex, id);
          }
          setSelectedTextId(hitId);
          // If text tool is active, single click selects; editing is entered by double-click
          // or by creating a new textbox.
          return;
        }

        // Creating a new text box: delete older empty ones on this page first.
        if (objects.length > 0) {
          const toRemove: string[] = [];
          for (const o of objects) {
            if (o.type !== 'text') continue;
            const t = String((o as any).text ?? '').trim();
            if (t.length === 0) toRemove.push(o.id);
          }
          for (const id of toRemove) removeOverlayObject(params.pageIndex, id);
        }

        const id = createId('txt');
        const obj: TextObj = {
          id,
          type: 'text',
          text: '',
          color: '#111111',
          fontSize: 16,
          font: {
            family: 'Helvetica',
            size: 16,
            bold: false,
            italic: false,
          },
          strike: false,
          align: 'left',
          lineHeight: 1.3,
          rect: { x: p.x, y: p.y, w: 220, h: 80 },
        };
        addOverlayObject(params.pageIndex, obj);
        setSelectedTextId(id);
        setEditingTextId(id);
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
    params.fontSize,
    addOverlayObject,
    removeOverlayObject,
    setSelectedTextId,
    setEditingTextId,
  ]);
}
