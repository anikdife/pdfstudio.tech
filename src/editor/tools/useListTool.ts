import type React from 'react';
import { useMemo } from 'react';
import type { ListObj, OverlayObject } from '../state/types';
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
};

function hitTestList(pageX: number, pageY: number, objects: OverlayObject[]): string | null {
  // topmost: last object wins
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type !== 'list') continue;
    const r = (o as any).rect as { x: number; y: number; w: number; h: number };
    if (pageX >= r.x && pageX <= r.x + r.w && pageY >= r.y && pageY <= r.y + r.h) return (o as any).id;
  }
  return null;
}

function isEmptyList(obj: ListObj): boolean {
  const items = obj.items ?? [];
  if (items.length === 0) return true;
  return items.every((it) => String(it.text ?? '').trim().length === 0);
}

export function useListTool(params: Params) {
  const addOverlayObject = useDocumentStore((s) => s.addOverlayObject);
  const removeOverlayObject = useDocumentStore((s) => s.removeOverlayObject);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setEditingListId = useUiStore((s) => s.setEditingListId);

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
        const objects = doc?.overlays[params.pageIndex]?.objects ?? [];

        // If clicked inside existing list box, just select it.
        const hitId = hitTestList(p.x, p.y, objects);
        if (hitId) {
          // Remove any empty list boxes created before this one (same page).
          const idx = objects.findIndex((o) => o.type === 'list' && (o as any).id === hitId);
          if (idx > 0) {
            const toRemove: string[] = [];
            for (let i = 0; i < idx; i++) {
              const o = objects[i];
              if (o.type !== 'list') continue;
              const lo = o as any as ListObj;
              if (isEmptyList(lo)) toRemove.push(lo.id);
            }
            for (const id of toRemove) removeOverlayObject(params.pageIndex, id);
          }

          setSelectedListId(hitId);
          setEditingListId(null);
          return;
        }

        // Creating a new list: delete empty lists first.
        if (objects.length > 0) {
          const toRemove: string[] = [];
          for (const o of objects) {
            if (o.type !== 'list') continue;
            const lo = o as any as ListObj;
            if (isEmptyList(lo)) toRemove.push(lo.id);
          }
          for (const id of toRemove) removeOverlayObject(params.pageIndex, id);
        }

        const id = createId('lst');
        const itemId = createId('li');

        const obj: ListObj = {
          id,
          type: 'list',
          rect: { x: p.x, y: p.y, w: 260, h: 120 },
          items: [{ id: itemId, text: '', indentLevel: 0, checked: false }],

          listType: 'bullet',
          startNumber: 1,
          indentSize: 18,

          color: '#111111',
          fontSize: 16,
          font: { family: 'Helvetica', size: 16, bold: false, italic: false },
          strike: false,
          align: 'left',
          lineHeight: 1.3,
        };

        addOverlayObject(params.pageIndex, obj as any);
        setSelectedListId(id);
        setEditingListId(id);
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
    addOverlayObject,
    removeOverlayObject,
    setSelectedListId,
    setEditingListId,
  ]);
}
