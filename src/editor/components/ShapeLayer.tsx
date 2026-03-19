import type React from 'react';
import { useMemo, useRef } from 'react';
import { useDocumentStore } from '../state/documentStore';
import { useUiStore } from '../state/uiStore';
import type { PageRotation, ShapeObj, ShapeType, Tool } from '../state/types';
import { createId } from '../util/ids';
import { screenToPage } from '../util/coords';
import {
  angleFromCenter,
  clamp,
  computePolygonPoints,
  computeStarPoints,
  distancePointToSegment,
  pointsToSvg,
} from '../util/shapeMath';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'move';

function rectToViewRect(
  rect: { x: number; y: number; w: number; h: number },
  pageSize: { w: number; h: number },
  rotation: PageRotation,
): { x: number; y: number; w: number; h: number } {
  const rotFwd = (x: number, y: number) => {
    switch (rotation) {
      case 0:
        return { x, y };
      case 90:
        return { x: pageSize.h - y, y: x };
      case 180:
        return { x: pageSize.w - x, y: pageSize.h - y };
      case 270:
        return { x: y, y: pageSize.w - x };
      default:
        return { x, y };
    }
  };

  const p1 = rotFwd(rect.x, rect.y);
  const p2 = rotFwd(rect.x + rect.w, rect.y);
  const p3 = rotFwd(rect.x, rect.y + rect.h);
  const p4 = rotFwd(rect.x + rect.w, rect.y + rect.h);
  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function viewSizeForRotation(pageSize: { w: number; h: number }, rotation: PageRotation) {
  if (rotation === 90 || rotation === 270) return { w: pageSize.h, h: pageSize.w };
  return { w: pageSize.w, h: pageSize.h };
}

function defaultSizeForShape(shapeType: ShapeType) {
  if (shapeType === 'line' || shapeType === 'arrow' || shapeType === 'doubleArrow' || shapeType === 'connector') {
    return { w: 160, h: 40 };
  }
  if (shapeType === 'circle') return { w: 120, h: 120 };
  return { w: 140, h: 90 };
}

function shapeHitTest(pageX: number, pageY: number, shape: ShapeObj): boolean {
  const x = shape.x;
  const y = shape.y;
  const w = shape.w;
  const h = shape.h;

  // line-ish shapes: allow padded distance-to-segment
  if (shape.shapeType === 'line' || shape.shapeType === 'arrow' || shape.shapeType === 'doubleArrow' || shape.shapeType === 'connector') {
    const ax = x;
    const ay = y + h / 2;
    const bx = x + w;
    const by = y + h / 2;
    const d = distancePointToSegment({ px: pageX, py: pageY, ax, ay, bx, by });
    return d <= 8;
  }

  return pageX >= x && pageX <= x + w && pageY >= y && pageY <= y + h;
}

function renderShapePath(shape: ShapeObj) {
  const x = 0;
  const y = 0;
  const w = Math.max(1, shape.w);
  const h = Math.max(1, shape.h);

  const type = shape.shapeType;

  if (type === 'rect') return { kind: 'rect' as const, rx: 0 };
  if (type === 'roundRect') return { kind: 'rect' as const, rx: Math.min(18, Math.min(w, h) / 4) };
  if (type === 'circle') return { kind: 'ellipse' as const, cx: x + w / 2, cy: y + h / 2, rx: Math.min(w, h) / 2, ry: Math.min(w, h) / 2 };
  if (type === 'ellipse') return { kind: 'ellipse' as const, cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };

  if (type === 'triangle') {
    const pts = [
      { x: x + w / 2, y: y },
      { x: x, y: y + h },
      { x: x + w, y: y + h },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'polygon') {
    const pts = computePolygonPoints({ x, y, w, h, sides: 6 });
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'star' || type === 'seal') {
    const pts = computeStarPoints({ x, y, w, h, points: 5, innerRatio: type === 'seal' ? 0.55 : 0.5 });
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'process') return { kind: 'rect' as const, rx: 6 };

  if (type === 'decision') {
    const pts = [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'terminator') return { kind: 'rect' as const, rx: Math.min(w, h) / 2 };

  if (type === 'inputOutput') {
    const skew = Math.min(w * 0.18, 24);
    const pts = [
      { x: x + skew, y },
      { x: x + w, y },
      { x: x + w - skew, y: y + h },
      { x, y: y + h },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'document') {
    const wave = Math.min(16, h * 0.2);
    const d = [
      `M ${x} ${y}`,
      `L ${x + w} ${y}`,
      `L ${x + w} ${y + h - wave}`,
      `C ${x + w * 0.75} ${y + h} ${x + w * 0.25} ${y + h - 2 * wave} ${x} ${y + h - wave}`,
      `Z`,
    ].join(' ');
    return { kind: 'path' as const, d };
  }

  if (type === 'database') {
    const r = Math.min(18, h * 0.25);
    const d = [
      `M ${x} ${y + r}`,
      `C ${x} ${y} ${x + w} ${y} ${x + w} ${y + r}`,
      `L ${x + w} ${y + h - r}`,
      `C ${x + w} ${y + h} ${x} ${y + h} ${x} ${y + h - r}`,
      `Z`,
    ].join(' ');
    return { kind: 'path' as const, d, topEllipse: { cx: x + w / 2, cy: y + r, rx: w / 2, ry: r } };
  }

  if (type === 'speechBubble') {
    const tail = shape.variant ?? 'tail-down';
    const r = Math.min(14, Math.min(w, h) / 5);
    const tailSize = Math.min(18, Math.min(w, h) / 4);

    // rounded rect base
    const baseX = x;
    const baseY = y;
    const baseW = w;
    const baseH = h;

    const cx = baseX + baseW / 2;
    const cy = baseY + baseH / 2;

    // Tail point outside the rect.
    let tx = cx;
    let ty = baseY + baseH + tailSize;
    if (tail === 'tail-up') {
      tx = cx;
      ty = baseY - tailSize;
    } else if (tail === 'tail-left') {
      tx = baseX - tailSize;
      ty = cy;
    } else if (tail === 'tail-right') {
      tx = baseX + baseW + tailSize;
      ty = cy;
    }

    // Tail attaches near center of one edge.
    const attach = (() => {
      if (tail === 'tail-up') return { ax: cx - tailSize / 2, ay: baseY, bx: cx + tailSize / 2, by: baseY };
      if (tail === 'tail-left') return { ax: baseX, ay: cy - tailSize / 2, bx: baseX, by: cy + tailSize / 2 };
      if (tail === 'tail-right') return { ax: baseX + baseW, ay: cy - tailSize / 2, bx: baseX + baseW, by: cy + tailSize / 2 };
      return { ax: cx - tailSize / 2, ay: baseY + baseH, bx: cx + tailSize / 2, by: baseY + baseH };
    })();

    const d = [
      // rounded rect
      `M ${baseX + r} ${baseY}`,
      `L ${baseX + baseW - r} ${baseY}`,
      `Q ${baseX + baseW} ${baseY} ${baseX + baseW} ${baseY + r}`,
      `L ${baseX + baseW} ${baseY + baseH - r}`,
      `Q ${baseX + baseW} ${baseY + baseH} ${baseX + baseW - r} ${baseY + baseH}`,
      `L ${baseX + r} ${baseY + baseH}`,
      `Q ${baseX} ${baseY + baseH} ${baseX} ${baseY + baseH - r}`,
      `L ${baseX} ${baseY + r}`,
      `Q ${baseX} ${baseY} ${baseX + r} ${baseY}`,
      `Z`,
      // tail triangle
      `M ${attach.ax} ${attach.ay}`,
      `L ${tx} ${ty}`,
      `L ${attach.bx} ${attach.by}`,
      `Z`,
    ].join(' ');

    return { kind: 'path' as const, d };
  }

  if (type === 'labelTag') {
    const notch = Math.min(26, w * 0.22);
    const pts = [
      { x, y },
      { x: x + w - notch, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w - notch, y: y + h },
      { x, y: y + h },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'pointerCallout') {
    const r = Math.min(14, Math.min(w, h) / 5);
    const tailSize = Math.min(22, Math.min(w, h) / 3);
    const d = [
      `M ${x + r} ${y}`,
      `L ${x + w - r} ${y}`,
      `Q ${x + w} ${y} ${x + w} ${y + r}`,
      `L ${x + w} ${y + h - r}`,
      `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
      `L ${x + w * 0.55} ${y + h}`,
      `L ${x + w * 0.5} ${y + h + tailSize}`,
      `L ${x + w * 0.45} ${y + h}`,
      `L ${x + r} ${y + h}`,
      `Q ${x} ${y + h} ${x} ${y + h - r}`,
      `L ${x} ${y + r}`,
      `Q ${x} ${y} ${x + r} ${y}`,
      `Z`,
    ].join(' ');
    return { kind: 'path' as const, d };
  }

  if (type === 'ribbon') {
    const flap = Math.min(22, h * 0.35);
    const pts = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h - flap },
      { x: x + w * 0.75, y: y + h },
      { x: x + w * 0.5, y: y + h - flap },
      { x: x + w * 0.25, y: y + h },
      { x, y: y + h - flap },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  if (type === 'banner') {
    const notch = Math.min(22, h * 0.35);
    const pts = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x: x + w - notch, y: y + h - notch },
      { x: x + notch, y: y + h - notch },
      { x, y: y + h },
    ];
    return { kind: 'polygon' as const, points: pointsToSvg(pts) };
  }

  // curvedArrow placeholder shouldn't be placeable; still render as simple arrow if it exists.
  if (type === 'curvedArrow') {
    const d = `M ${x} ${y + h / 2} Q ${x + w / 2} ${y - h / 2} ${x + w} ${y + h / 2}`;
    return { kind: 'path' as const, d };
  }

  // Fallback
  return { kind: 'rect' as const, rx: 0 };
}

export function ShapeLayer(props: {
  pageIndex: number;
  pageSize: { w: number; h: number };
  pageRotation: PageRotation;
  zoom: number;
  pan: { x: number; y: number };
  tool: Tool;
  getCanvasRect: () => DOMRect | null;
}) {
  const doc = useDocumentStore((s) => s.doc);
  const addShape = useDocumentStore((s) => s.addShape);
  const patchShape = useDocumentStore((s) => s.patchShape);

  const selectedShapeId = useUiStore((s) => s.selectedShapeId);
  const setSelectedShapeId = useUiStore((s) => s.setSelectedShapeId);

  const placementShapeType = useUiStore((s) => s.placementShapeType);
  const placementShapeVariant = useUiStore((s) => s.placementShapeVariant);

  const enabled = props.tool === 'shape';

  const shapes = useMemo(() => {
    if (!doc) return [] as ShapeObj[];
    const objects = doc.overlays[props.pageIndex]?.objects ?? [];
    return objects.filter((o) => o.type === 'shape') as ShapeObj[];
  }, [doc, props.pageIndex]);

  const selectedShape = useMemo(
    () => (selectedShapeId ? shapes.find((s) => s.id === selectedShapeId) ?? null : null),
    [selectedShapeId, shapes],
  );

  // SVG markers
  const markerId = 'shapeArrowHead';

  const rafRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<{ pageIndex: number; id: string; patch: Partial<ShapeObj> } | null>(null);

  const schedulePatch = (pageIndex: number, id: string, patch: Partial<ShapeObj>) => {
    pendingPatchRef.current = { pageIndex, id, patch: { ...(pendingPatchRef.current?.patch ?? {}), ...patch } };
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const p = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (!p) return;
      patchShape(p.pageIndex, p.id, p.patch);
    });
  };

  const dragRef = useRef<
    | null
    | {
        pointerId: number;
        shapeId: string;
        mode: Handle;
        startX: number;
        startY: number;
        startShape: ShapeObj;
        startAngle: number;
        startRotation: number;
      }
  >(null);

  const onPointerDownBackground = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (!placementShapeType) return;
    if (placementShapeType === 'curvedArrow') return;

    if (e.button !== 0) return;

    const rect = props.getCanvasRect();
    if (!rect) return;

    const p = screenToPage(
      { clientX: e.clientX, clientY: e.clientY },
      rect,
      props.zoom,
      props.pan,
      props.pageRotation,
      props.pageSize,
    );

    // don't place on top of existing shape hit
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapeHitTest(p.x, p.y, shapes[i])) return;
    }

    const size = defaultSizeForShape(placementShapeType);

    const w0 = size.w;
    const h0 = size.h;
    const x0 = clamp(p.x, 0, Math.max(0, props.pageSize.w - w0));
    const y0 = clamp(p.y, 0, Math.max(0, props.pageSize.h - h0));

    const id = createId('shp');
    const obj: ShapeObj = {
      id,
      type: 'shape',
      shapeType: placementShapeType,
      variant: placementShapeVariant ?? undefined,
      x: x0,
      y: y0,
      w: w0,
      h: h0,
      rotation: 0,
      style: { fill: '#ffffff', stroke: '#111111', strokeWidth: 2, opacity: 1 },
      zIndex: 0,
    };

    addShape(props.pageIndex, obj);
    setSelectedShapeId(id);
  };

  const beginDrag = (e: React.PointerEvent, shape: ShapeObj, mode: Handle) => {
    if (!enabled) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    const rect = props.getCanvasRect();
    if (!rect) return;
    const p = screenToPage(
      { clientX: e.clientX, clientY: e.clientY },
      rect,
      props.zoom,
      props.pan,
      props.pageRotation,
      props.pageSize,
    );

    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const startAngle = angleFromCenter({ cx, cy, x: p.x, y: p.y });

    dragRef.current = {
      pointerId: e.pointerId,
      shapeId: shape.id,
      mode,
      startX: p.x,
      startY: p.y,
      startShape: { ...shape },
      startAngle,
      startRotation: shape.rotation ?? 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    const rect = props.getCanvasRect();
    if (!rect) return;
    const p = screenToPage(
      { clientX: e.clientX, clientY: e.clientY },
      rect,
      props.zoom,
      props.pan,
      props.pageRotation,
      props.pageSize,
    );

    const dx = p.x - d.startX;
    const dy = p.y - d.startY;

    const s = d.startShape;
    const minSize = 10;

    if (d.mode === 'move') {
      schedulePatch(props.pageIndex, d.shapeId, {
        x: clamp(s.x + dx, 0, Math.max(0, props.pageSize.w - s.w)),
        y: clamp(s.y + dy, 0, Math.max(0, props.pageSize.h - s.h)),
      });
      return;
    }

    if (d.mode === 'rotate') {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const a = angleFromCenter({ cx, cy, x: p.x, y: p.y });
      const delta = a - d.startAngle;
      schedulePatch(props.pageIndex, d.shapeId, { rotation: d.startRotation + delta });
      return;
    }

    // Resize
    let nx = s.x;
    let ny = s.y;
    let nw = s.w;
    let nh = s.h;

    if (d.mode.includes('e')) {
      nw = clamp(s.w + dx, minSize, props.pageSize.w);
    }
    if (d.mode.includes('s')) {
      nh = clamp(s.h + dy, minSize, props.pageSize.h);
    }
    if (d.mode.includes('w')) {
      nx = clamp(s.x + dx, 0, s.x + s.w - minSize);
      nw = clamp(s.w - dx, minSize, s.x + s.w);
    }
    if (d.mode.includes('n')) {
      ny = clamp(s.y + dy, 0, s.y + s.h - minSize);
      nh = clamp(s.h - dy, minSize, s.y + s.h);
    }

    // Keep circles square.
    if (s.shapeType === 'circle') {
      const size = Math.max(nw, nh);
      nw = size;
      nh = size;
    }

    // Clamp within page.
    nx = clamp(nx, 0, Math.max(0, props.pageSize.w - nw));
    ny = clamp(ny, 0, Math.max(0, props.pageSize.h - nh));

    schedulePatch(props.pageIndex, d.shapeId, { x: nx, y: ny, w: nw, h: nh });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const viewBox = useMemo(() => {
    const vs = viewSizeForRotation(props.pageSize, props.pageRotation);
    return `0 0 ${vs.w} ${vs.h}`;
  }, [props.pageRotation, props.pageSize.h, props.pageSize.w]);

  // Even when tool isn't shape, we render shapes but disable pointer events so existing tools are untouched.
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: enabled ? 'auto' : 'none',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg
        style={{ width: '100%', height: '100%' }}
        viewBox={viewBox}
        onPointerDown={onPointerDownBackground}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#111111" />
          </marker>
        </defs>

        {shapes.map((shape) => {
          const style = shape.style ?? { fill: '#ffffff', stroke: '#111111', strokeWidth: 2, opacity: 1 };
          const fill = style.fill === 'none' ? 'none' : style.fill;
          const stroke = style.stroke;
          const strokeWidth = style.strokeWidth;
          const opacity = style.opacity;

          const isSelected = shape.id === selectedShapeId;

          const vr = rectToViewRect(
            { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
            props.pageSize,
            props.pageRotation,
          );

          const cx = vr.x + vr.w / 2;
          const cy = vr.y + vr.h / 2;
          const transform = `rotate(${shape.rotation ?? 0} ${cx} ${cy})`;

          // For polygon/star/etc we reuse the existing helpers by temporarily mapping vr -> shape.w/h.
          const body = renderShapePath({ ...shape, w: vr.w, h: vr.h } as any);

          const common = {
            fill,
            stroke,
            strokeWidth,
            opacity,
          };

          const lineLike =
            shape.shapeType === 'line' ||
            shape.shapeType === 'arrow' ||
            shape.shapeType === 'doubleArrow' ||
            shape.shapeType === 'connector' ||
            shape.shapeType === 'curvedArrow';

          const onPointerDownShape = (e: React.PointerEvent) => {
            if (!enabled) return;
            if (e.button !== 0) return;

            // Select + allow immediate dragging (common expectation).
            // Resize/rotate handles stop propagation via beginDrag(), so they won't double-trigger.
            setSelectedShapeId(shape.id);
            beginDrag(e, shape, 'move');
          };

          return (
            <g
              key={shape.id}
              transform={transform}
              onPointerDown={onPointerDownShape}
              style={{ cursor: enabled ? 'pointer' : 'default' }}
            >
              {lineLike ? (
                (() => {
                  const ax = vr.x;
                  const ay = vr.y + vr.h / 2;
                  const bx = vr.x + vr.w;
                  const by = vr.y + vr.h / 2;

                  if (shape.shapeType === 'curvedArrow') {
                    return (
                      <path
                        d={`M ${ax} ${ay} Q ${vr.x + vr.w / 2} ${vr.y - vr.h / 2} ${bx} ${by}`}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        opacity={opacity}
                        markerEnd={`url(#${markerId})`}
                      />
                    );
                  }

                  const markerEnd =
                    shape.shapeType === 'arrow' || shape.shapeType === 'connector' ? `url(#${markerId})` : undefined;
                  const markerStart = shape.shapeType === 'doubleArrow' ? `url(#${markerId})` : undefined;

                  return (
                    <g>
                      <line
                        x1={ax}
                        y1={ay}
                        x2={bx}
                        y2={by}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        opacity={opacity}
                        markerEnd={markerEnd}
                        markerStart={markerStart}
                      />
                      {shape.shapeType === 'connector' ? (
                        <g>
                          <circle cx={ax} cy={ay} r={Math.max(3, strokeWidth)} fill={stroke} opacity={opacity} />
                          <circle cx={bx} cy={by} r={Math.max(3, strokeWidth)} fill={stroke} opacity={opacity} />
                        </g>
                      ) : null}
                    </g>
                  );
                })()
              ) : body.kind === 'rect' ? (
                <rect x={vr.x} y={vr.y} width={vr.w} height={vr.h} rx={body.rx} ry={body.rx} {...common} />
              ) : body.kind === 'ellipse' ? (
                <ellipse cx={vr.x + vr.w / 2} cy={vr.y + vr.h / 2} rx={body.rx} ry={body.ry} {...common} />
              ) : body.kind === 'polygon' ? (
                <polygon points={body.points} transform={`translate(${vr.x} ${vr.y})`} {...common} />
              ) : body.kind === 'path' ? (
                <g>
                  <path d={body.d} transform={`translate(${vr.x} ${vr.y})`} {...common} />
                  {'topEllipse' in body && body.topEllipse ? (
                    <ellipse
                      cx={body.topEllipse.cx + vr.x}
                      cy={body.topEllipse.cy + vr.y}
                      rx={body.topEllipse.rx}
                      ry={body.topEllipse.ry}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      opacity={opacity}
                    />
                  ) : null}
                </g>
              ) : null}

              {/* selection + handles */}
              {isSelected && enabled ? (
                (() => {
                  const x = vr.x;
                  const y = vr.y;
                  const w = vr.w;
                  const h = vr.h;
                  const handleSize = 8;

                  const handles: Array<{ k: Handle; x: number; y: number }>
                    = [
                      { k: 'nw', x: x, y: y },
                      { k: 'n', x: x + w / 2, y: y },
                      { k: 'ne', x: x + w, y: y },
                      { k: 'e', x: x + w, y: y + h / 2 },
                      { k: 'se', x: x + w, y: y + h },
                      { k: 's', x: x + w / 2, y: y + h },
                      { k: 'sw', x: x, y: y + h },
                      { k: 'w', x: x, y: y + h / 2 },
                    ];

                  const rotX = x + w / 2;
                  const rotY = y - 18;

                  return (
                    <g>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill="none"
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        onPointerDown={(e) => beginDrag(e, shape, 'move')}
                        style={{ cursor: 'move' }}
                      />

                      {/* rotate handle */}
                      <line x1={x + w / 2} y1={y} x2={rotX} y2={rotY} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
                      <circle
                        cx={rotX}
                        cy={rotY}
                        r={6}
                        fill="#fff"
                        stroke="rgba(0,0,0,0.6)"
                        strokeWidth={1}
                        onPointerDown={(e) => beginDrag(e, shape, 'rotate')}
                        style={{ cursor: 'grab' }}
                      />

                      {handles.map((hnd) => (
                        <rect
                          key={hnd.k}
                          x={hnd.x - handleSize / 2}
                          y={hnd.y - handleSize / 2}
                          width={handleSize}
                          height={handleSize}
                          fill="#fff"
                          stroke="rgba(0,0,0,0.7)"
                          strokeWidth={1}
                          onPointerDown={(e) => beginDrag(e, shape, hnd.k)}
                          style={{ cursor: 'nwse-resize' }}
                        />
                      ))}
                    </g>
                  );
                })()
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
