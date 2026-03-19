import type { PageRotation } from '../state/types';


















































type ScreenPoint = { clientX: number; clientY: number };
type PagePoint = { x: number; y: number };

type PageSize = { w: number; h: number };

function rotFwd(x: number, y: number, pageW: number, pageH: number, rotation: PageRotation) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: pageH - y, y: x };
    case 180:
      return { x: pageW - x, y: pageH - y };
    case 270:
      return { x: y, y: pageW - x };
    default:
      return { x, y };
  }
}

function rotInv(x: number, y: number, pageW: number, pageH: number, rotation: PageRotation) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: y, y: pageH - x };
    case 180:
      return { x: pageW - x, y: pageH - y };
    case 270:
      return { x: pageW - y, y: x };
    default:
      return { x, y };
  }
}

export function screenToPage(
  p: ScreenPoint,
  canvasRect: DOMRect,
  zoom: number,
  pan: { x: number; y: number },
  pageRotation: PageRotation,
  pageSize: PageSize,
): PagePoint {
  const sx = (p.clientX - canvasRect.left - pan.x) / zoom;
  const sy = (p.clientY - canvasRect.top - pan.y) / zoom;

  const inv = rotInv(sx, sy, pageSize.w, pageSize.h, pageRotation);
  return {
    x: Math.max(0, Math.min(pageSize.w, inv.x)),
    y: Math.max(0, Math.min(pageSize.h, inv.y)),
  };
}

export function pageToScreen(
  p: PagePoint,
  canvasRect: DOMRect,
  zoom: number,
  pan: { x: number; y: number },
  pageRotation: PageRotation,
  pageSize: PageSize,
): ScreenPoint {
  const view = rotFwd(p.x, p.y, pageSize.w, pageSize.h, pageRotation);

  return {
    clientX: canvasRect.left + pan.x + view.x * zoom,
    clientY: canvasRect.top + pan.y + view.y * zoom,
  };
}
