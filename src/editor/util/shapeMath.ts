export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

export function rotatePoint(params: { cx: number; cy: number; x: number; y: number; deg: number }) {
  const a = degToRad(params.deg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = params.x - params.cx;
  const dy = params.y - params.cy;
  return {
    x: params.cx + dx * cos - dy * sin,
    y: params.cy + dx * sin + dy * cos,
  };
}

export function angleFromCenter(params: { cx: number; cy: number; x: number; y: number }) {
  const a = Math.atan2(params.y - params.cy, params.x - params.cx);
  return radToDeg(a);
}

export function computePolygonPoints(params: { x: number; y: number; w: number; h: number; sides: number }) {
  const sides = Math.max(3, Math.floor(params.sides));
  const cx = params.x + params.w / 2;
  const cy = params.y + params.h / 2;
  const rx = params.w / 2;
  const ry = params.h / 2;

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return pts;
}

export function computeStarPoints(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  points: number;
  innerRatio: number;
}) {
  const points = Math.max(3, Math.floor(params.points));
  const innerRatio = clamp(params.innerRatio, 0.1, 0.95);

  const cx = params.x + params.w / 2;
  const cy = params.y + params.h / 2;
  const rx = params.w / 2;
  const ry = params.h / 2;

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points * 2; i++) {
    const isOuter = i % 2 === 0;
    const rrx = isOuter ? rx : rx * innerRatio;
    const rry = isOuter ? ry : ry * innerRatio;
    const t = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(t) * rrx, y: cy + Math.sin(t) * rry });
  }
  return pts;
}

export function pointsToSvg(pts: Array<{ x: number; y: number }>) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

export function distancePointToSegment(params: {
  px: number;
  py: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}) {
  const { px, py, ax, ay, bx, by } = params;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const denom = abx * abx + aby * aby;
  if (denom <= 0) return Math.hypot(px - ax, py - ay);

  let t = (apx * abx + apy * aby) / denom;
  t = clamp(t, 0, 1);

  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}
