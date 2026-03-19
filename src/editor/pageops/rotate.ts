import type { PageRotation } from '../state/types';

export function normalizeRotation(deg: number): PageRotation {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return (n === 0 ? 0 : n === 90 ? 90 : n === 180 ? 180 : 270) as PageRotation;
}

export function rotateLeft(current: PageRotation): PageRotation {
  return normalizeRotation(current - 90);
}

export function rotateRight(current: PageRotation): PageRotation {
  return normalizeRotation(current + 90);
}
