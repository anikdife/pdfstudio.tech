import type { PageRotation } from '../state/types';

export type PageCrop = { left: number; top: number; right: number; bottom: number }; // in points, origin = top-left, unrotated page

export function fullPageCrop(pageW: number, pageH: number): PageCrop {
  return { left: 0, top: 0, right: pageW, bottom: pageH };
}

export function clampCrop(crop: PageCrop, pageW: number, pageH: number): PageCrop {
  const left = Math.max(0, Math.min(crop.left, pageW));
  const right = Math.max(0, Math.min(crop.right, pageW));
  const top = Math.max(0, Math.min(crop.top, pageH));
  const bottom = Math.max(0, Math.min(crop.bottom, pageH));
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
  };
}

export function cropToPdfLibCropBox(
  crop: PageCrop,
  pageW: number,
  pageH: number,
): { x: number; y: number; w: number; h: number } {
  // pdf-lib uses bottom-left origin. Our crop uses top-left origin.
  const c = clampCrop(crop, pageW, pageH);
  const x = c.left;
  const w = Math.max(0, c.right - c.left);
  const h = Math.max(0, c.bottom - c.top);
  const y = pageH - c.bottom;
  return { x, y, w, h };
}

function rotFwd(x: number, y: number, pageW: number, pageH: number, rotation: PageRotation) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      // CW 90: (x,y) -> (H - y, x)
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
      // inverse of (H - y, x): (x',y') -> (y', H - x')
      return { x: y, y: pageH - x };
    case 180:
      return { x: pageW - x, y: pageH - y };
    case 270:
      // inverse of (y, W - x): (x',y') -> (W - y', x')
      return { x: pageW - y, y: x };
    default:
      return { x, y };
  }
}

export function viewSizeForRotation(pageW: number, pageH: number, rotation: PageRotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: pageH, h: pageW } : { w: pageW, h: pageH };
}

export function cropToViewRect(crop: PageCrop, pageW: number, pageH: number, rotation: PageRotation) {
  const c = clampCrop(crop, pageW, pageH);
  const p1 = rotFwd(c.left, c.top, pageW, pageH, rotation);
  const p2 = rotFwd(c.right, c.top, pageW, pageH, rotation);
  const p3 = rotFwd(c.right, c.bottom, pageW, pageH, rotation);
  const p4 = rotFwd(c.left, c.bottom, pageW, pageH, rotation);
  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

export function viewPointToUnrotated(
  viewX: number,
  viewY: number,
  pageW: number,
  pageH: number,
  rotation: PageRotation,
): { x: number; y: number } {
  return rotInv(viewX, viewY, pageW, pageH, rotation);
}
