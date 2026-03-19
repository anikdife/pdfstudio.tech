import type { ShapeMask } from '../state/types';

const pathCache = new Map<string, string>();

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const keyFor = (imageId: string, mask: ShapeMask, w: number, h: number) => {
  // Cache per imageId + mask signature (+ bounds since circle/rect radius depend on aspect).
  return `${imageId}|${w}x${h}|${JSON.stringify(mask)}`;
};

const pointsToD = (pts: Array<{ x: number; y: number }>) => {
  if (pts.length === 0) return '';
  const [first, ...rest] = pts;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`;
};

const regularPolygonPoints = (sides: number, cx: number, cy: number, r: number) => {
  const pts: Array<{ x: number; y: number }> = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
};

const starPoints = (points: number, cx: number, cy: number, outerR: number, innerR: number) => {
  const pts: Array<{ x: number; y: number }> = [];
  const total = points * 2;
  const start = -Math.PI / 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = start + (i * 2 * Math.PI) / total;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
};

/**
 * Normalized (0..1) SVG path `d` for the given mask.
 * This returns a *normalized* path; use `maskPathForBounds` for aspect-correct paths.
 */
export function maskPathNormalized(mask: ShapeMask): string {
  switch (mask.type) {
    case 'none':
      return '';
    case 'rect': {
      const r = clamp((mask.radius ?? 0) / 100, 0, 0.48);
      // Rounded rect in normalized space.
      // Uses quadratic corners for simplicity.
      const rr = r;
      const x0 = 0;
      const y0 = 0;
      const x1 = 1;
      const y1 = 1;
      return [
        `M ${x0 + rr} ${y0}`,
        `L ${x1 - rr} ${y0}`,
        `Q ${x1} ${y0} ${x1} ${y0 + rr}`,
        `L ${x1} ${y1 - rr}`,
        `Q ${x1} ${y1} ${x1 - rr} ${y1}`,
        `L ${x0 + rr} ${y1}`,
        `Q ${x0} ${y1} ${x0} ${y1 - rr}`,
        `L ${x0} ${y0 + rr}`,
        `Q ${x0} ${y0} ${x0 + rr} ${y0}`,
        'Z',
      ].join(' ');
    }
    case 'circle': {
      // Unit circle in normalized space (will become ellipse if non-square bounds).
      // For a true circle in non-square bounds use `maskPathForBounds`.
      return 'M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z';
    }
    case 'ellipse':
      return 'M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z';
    case 'triangle':
      return pointsToD([
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]);
    case 'diamond':
      return pointsToD([
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ]);
    case 'hexagon':
      return pointsToD([
        { x: 0.25, y: 0 },
        { x: 0.75, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.75, y: 1 },
        { x: 0.25, y: 1 },
        { x: 0, y: 0.5 },
      ]);
    case 'polygon': {
      const sides = clamp(mask.sides ?? 5, 5, 12);
      const pts = regularPolygonPoints(sides, 0.5, 0.5, 0.5);
      return pointsToD(pts);
    }
    case 'star': {
      const innerRatio = clamp(mask.innerRatio ?? 0.5, 0.1, 0.9);
      const pts = starPoints(5, 0.5, 0.5, 0.5, 0.5 * innerRatio);
      return pointsToD(pts);
    }
    case 'bubble': {
      // Simple speech bubble: rounded-ish rect + bottom tail.
      const r = 0.12;
      const tailW = 0.18;
      const tailH = 0.16;
      const tailX = 0.5;
      const x0 = 0;
      const y0 = 0;
      const x1 = 1;
      const y1 = 1 - tailH;
      const leftTail = tailX - tailW / 2;
      const rightTail = tailX + tailW / 2;
      return [
        `M ${x0 + r} ${y0}`,
        `L ${x1 - r} ${y0}`,
        `Q ${x1} ${y0} ${x1} ${y0 + r}`,
        `L ${x1} ${y1 - r}`,
        `Q ${x1} ${y1} ${x1 - r} ${y1}`,
        `L ${rightTail} ${y1}`,
        `L ${tailX} ${y1 + tailH}`,
        `L ${leftTail} ${y1}`,
        `L ${x0 + r} ${y1}`,
        `Q ${x0} ${y1} ${x0} ${y1 - r}`,
        `L ${x0} ${y0 + r}`,
        `Q ${x0} ${y0} ${x0 + r} ${y0}`,
        'Z',
      ].join(' ');
    }
    case 'heart': {
      // Classic heart using cubic curves in normalized space.
      return [
        'M 0.5 0.92',
        'C 0.15 0.72 0.02 0.45 0.2 0.28',
        'C 0.34 0.15 0.5 0.24 0.5 0.38',
        'C 0.5 0.24 0.66 0.15 0.8 0.28',
        'C 0.98 0.45 0.85 0.72 0.5 0.92',
        'Z',
      ].join(' ');
    }
    default:
      return '';
  }
}

/**
 * Aspect/bounds-aware SVG path `d` in the given bounds.
 * `w`/`h` are in the target coordinate space (e.g. pixels).
 */
export function maskPathForBounds(mask: ShapeMask, w: number, h: number): string {
  if (mask.type === 'none') return '';

  const nx = (x: number) => x * w;
  const ny = (y: number) => y * h;

  // For most shapes, scaling the normalized path is sufficient.
  // Circle is special: it should remain a circle even when w != h.
  switch (mask.type) {
    case 'circle': {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    }
    case 'rect': {
      const radius = clamp(mask.radius ?? 0, 0, 48);
      const rr = Math.min(radius, w / 2, h / 2);
      const x0 = 0;
      const y0 = 0;
      const x1 = w;
      const y1 = h;
      // Rounded rect using quadratic curves.
      return [
        `M ${x0 + rr} ${y0}`,
        `L ${x1 - rr} ${y0}`,
        `Q ${x1} ${y0} ${x1} ${y0 + rr}`,
        `L ${x1} ${y1 - rr}`,
        `Q ${x1} ${y1} ${x1 - rr} ${y1}`,
        `L ${x0 + rr} ${y1}`,
        `Q ${x0} ${y1} ${x0} ${y1 - rr}`,
        `L ${x0} ${y0 + rr}`,
        `Q ${x0} ${y0} ${x0 + rr} ${y0}`,
        'Z',
      ].join(' ');
    }
    default: {
      // Scale normalized points/paths into bounds by using precomputed normalized and then scaling coordinates.
      // For simplicity, rebuild polygons directly for polygon/star/hex/etc.
      if (mask.type === 'polygon') {
        const sides = clamp(mask.sides ?? 5, 5, 12);
        const r = Math.min(w, h) / 2;
        const pts = regularPolygonPoints(sides, w / 2, h / 2, r);
        return pointsToD(pts);
      }
      if (mask.type === 'star') {
        const innerRatio = clamp(mask.innerRatio ?? 0.5, 0.1, 0.9);
        const outerR = Math.min(w, h) / 2;
        const innerR = outerR * innerRatio;
        const pts = starPoints(5, w / 2, h / 2, outerR, innerR);
        return pointsToD(pts);
      }
      if (mask.type === 'hexagon') {
        return pointsToD([
          { x: nx(0.25), y: ny(0) },
          { x: nx(0.75), y: ny(0) },
          { x: nx(1), y: ny(0.5) },
          { x: nx(0.75), y: ny(1) },
          { x: nx(0.25), y: ny(1) },
          { x: nx(0), y: ny(0.5) },
        ]);
      }
      if (mask.type === 'triangle') {
        return pointsToD([
          { x: nx(0.5), y: ny(0) },
          { x: nx(1), y: ny(1) },
          { x: nx(0), y: ny(1) },
        ]);
      }
      if (mask.type === 'diamond') {
        return pointsToD([
          { x: nx(0.5), y: ny(0) },
          { x: nx(1), y: ny(0.5) },
          { x: nx(0.5), y: ny(1) },
          { x: nx(0), y: ny(0.5) },
        ]);
      }
      if (mask.type === 'bubble') {
        // Scale the normalized bubble path into bounds by rebuilding with bounds-aware math.
        const r = Math.min(w, h) * 0.12;
        const tailW = w * 0.18;
        const tailH = h * 0.16;
        const tailX = w * 0.5;
        const x0 = 0;
        const y0 = 0;
        const x1 = w;
        const y1 = h - tailH;
        const leftTail = tailX - tailW / 2;
        const rightTail = tailX + tailW / 2;
        const rr = Math.min(r, w / 2, y1 / 2);
        return [
          `M ${x0 + rr} ${y0}`,
          `L ${x1 - rr} ${y0}`,
          `Q ${x1} ${y0} ${x1} ${y0 + rr}`,
          `L ${x1} ${y1 - rr}`,
          `Q ${x1} ${y1} ${x1 - rr} ${y1}`,
          `L ${rightTail} ${y1}`,
          `L ${tailX} ${y1 + tailH}`,
          `L ${leftTail} ${y1}`,
          `L ${x0 + rr} ${y1}`,
          `Q ${x0} ${y1} ${x0} ${y1 - rr}`,
          `L ${x0} ${y0 + rr}`,
          `Q ${x0} ${y0} ${x0 + rr} ${y0}`,
          'Z',
        ].join(' ');
      }
      if (mask.type === 'heart') {
        // Scale the normalized heart path by simple multiplication.
        // Good enough for overlay preview.
        return [
          `M ${nx(0.5)} ${ny(0.92)}`,
          `C ${nx(0.15)} ${ny(0.72)} ${nx(0.02)} ${ny(0.45)} ${nx(0.2)} ${ny(0.28)}`,
          `C ${nx(0.34)} ${ny(0.15)} ${nx(0.5)} ${ny(0.24)} ${nx(0.5)} ${ny(0.38)}`,
          `C ${nx(0.5)} ${ny(0.24)} ${nx(0.66)} ${ny(0.15)} ${nx(0.8)} ${ny(0.28)}`,
          `C ${nx(0.98)} ${ny(0.45)} ${nx(0.85)} ${ny(0.72)} ${nx(0.5)} ${ny(0.92)}`,
          'Z',
        ].join(' ');
      }

      // Ellipse and any other fallback: just scale normalized ellipse.
      if (mask.type === 'ellipse') {
        const rx = w / 2;
        const ry = h / 2;
        const cx = w / 2;
        const cy = h / 2;
        return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry} Z`;
      }

      // Last resort: scale the normalized path in a very naive way by substituting numbers.
      // (We keep it unused for now.)
      return maskPathNormalized(mask);
    }
  }
}

export function getCachedMaskPathD(imageId: string, mask: ShapeMask, w: number, h: number): string {
  const k = keyFor(imageId, mask, w, h);
  const existing = pathCache.get(k);
  if (existing != null) return existing;
  const d = maskPathForBounds(mask, w, h);
  pathCache.set(k, d);
  return d;
}
