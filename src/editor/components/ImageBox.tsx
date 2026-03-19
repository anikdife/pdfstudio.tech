import { useMemo, useRef } from 'react';
import type { ImageObj, Tool } from '../state/types';
import { getCachedMaskPathD } from '../util/masks';

export function ImageBox(props: {
  obj: ImageObj;
  viewRect?: { x: number; y: number; w: number; h: number };
  isSelected: boolean;
  tool: Tool;
  zoom: number;
  pageRotation: 0 | 90 | 180 | 270;
  pageSize: { w: number; h: number };
  onSelect: () => void;
  onPatch: (patch: Partial<ImageObj>) => void;
}) {
  const isPassthroughTool =
    props.tool === 'highlight' ||
    props.tool === 'ink' ||
    props.tool === 'pages' ||
    props.tool === 'list' ||
    props.tool === 'shape';
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    raf: number | null;
    pending?: { x: number; y: number };
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
    raf: number | null;
    pending?: { w: number; h: number };
  } | null>(null);

  const style = useMemo(() => {
    const r = props.viewRect ?? props.obj.rect;
    return {
      left: r.x * props.zoom,
      top: r.y * props.zoom,
      width: r.w * props.zoom,
      height: r.h * props.zoom,
    };
  }, [props.viewRect, props.obj.rect, props.zoom]);

  const viewDeltaToUnrotatedDelta = (dxView: number, dyView: number) => {
    switch (props.pageRotation) {
      case 0:
        return { dx: dxView, dy: dyView };
      case 90:
        return { dx: dyView, dy: -dxView };
      case 180:
        return { dx: -dxView, dy: -dyView };
      case 270:
        return { dx: -dyView, dy: dxView };
      default:
        return { dx: dxView, dy: dyView };
    }
  };

  const bounds = useMemo(() => {
    return {
      w: props.obj.rect.w * props.zoom,
      h: props.obj.rect.h * props.zoom,
    };
  }, [props.obj.rect.w, props.obj.rect.h, props.zoom]);

  const commitPending = () => {
    const d = dragRef.current;
    if (!d?.pending) return;
    props.onPatch({ rect: { ...props.obj.rect, x: d.pending.x, y: d.pending.y } } as any);
    d.pending = undefined;
  };

  const scheduleCommit = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d) return;
    d.pending = { x, y };
    if (d.raf != null) return;
    d.raf = requestAnimationFrame(() => {
      if (!dragRef.current) return;
      dragRef.current.raf = null;
      commitPending();
    });
  };

  const commitResizePending = () => {
    const r = resizeRef.current;
    if (!r?.pending) return;
    props.onPatch({ rect: { ...props.obj.rect, w: r.pending.w, h: r.pending.h } } as any);
    r.pending = undefined;
  };

  const scheduleResizeCommit = (w: number, h: number) => {
    const r = resizeRef.current;
    if (!r) return;
    r.pending = { w, h };
    if (r.raf != null) return;
    r.raf = requestAnimationFrame(() => {
      if (!resizeRef.current) return;
      resizeRef.current.raf = null;
      commitResizePending();
    });
  };

  const f = props.obj.filters ?? {};
  const brightness = f.brightness ?? 1;
  const contrast = f.contrast ?? props.obj.contrast ?? 1;
  const saturation = f.saturation ?? 1;
  const grayscale = f.grayscale ?? 0;
  const sepia = f.sepia ?? 0;
  const invert = f.invert ?? 0;
  const opacity = props.obj.opacity ?? 1;
  const borderRadius = props.obj.borderRadius ?? 0;
  const crop = props.obj.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const mask = props.obj.mask ?? ({ type: 'none' } as const);
  const t = props.obj.transform ?? {};
  const flipX = Boolean(t.flipX);
  const flipY = Boolean(t.flipY);
  const skewX = Number.isFinite(t.skewX as any) ? Number(t.skewX) : 0;
  const skewY = Number.isFinite(t.skewY as any) ? Number(t.skewY) : 0;

  const filterCss = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) sepia(${sepia}) invert(${invert})`;

  const clipIds = useMemo(() => {
    const base = `imgclip-${props.obj.id}`;
    return {
      crop: `${base}-crop`,
      mask: `${base}-mask`,
    };
  }, [props.obj.id]);

  const cropRect = useMemo(() => {
    const x = crop.l * bounds.w;
    const y = crop.t * bounds.h;
    const w = Math.max(0, (1 - crop.l - crop.r) * bounds.w);
    const h = Math.max(0, (1 - crop.t - crop.b) * bounds.h);
    return { x, y, w, h };
  }, [crop.l, crop.t, crop.r, crop.b, bounds.w, bounds.h]);

  const maskD = useMemo(() => {
    if (mask.type === 'none') return '';
    // Cache per imageId + mask signature (+ bounds).
    const w = Math.max(1, Math.round(bounds.w));
    const h = Math.max(1, Math.round(bounds.h));
    return getCachedMaskPathD(props.obj.id, mask as any, w, h);
  }, [mask, bounds.w, bounds.h, props.obj.id]);

  const imageTransform = useMemo(() => {
    const w = Math.max(1, Math.round(bounds.w));
    const h = Math.max(1, Math.round(bounds.h));
    const cx = w / 2;
    const cy = h / 2;

    const ops: string[] = [];

    // Apply around center so it feels like a true flip.
    if (flipX || flipY) {
      ops.push(`translate(${cx} ${cy})`);
      ops.push(`scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`);
      ops.push(`translate(${-cx} ${-cy})`);
    }

    // Skew uses degrees; apply after flips.
    if (skewX) ops.push(`skewX(${skewX})`);
    if (skewY) ops.push(`skewY(${skewY})`);

    return ops.length ? ops.join(' ') : undefined;
  }, [bounds.w, bounds.h, flipX, flipY, skewX, skewY]);

  return (
    <div
      className={props.isSelected ? 'imageBox selected' : 'imageBox'}
      data-imagebox-id={props.obj.id}
      style={{
        position: 'absolute',
        ...style,
        pointerEvents: isPassthroughTool ? 'none' : 'auto',
        opacity,
        borderRadius,
        overflow: 'hidden',
        outline: props.isSelected ? '1px solid rgba(0,0,0,0.35)' : '1px solid transparent',
        outlineOffset: 2,
      }}
      onPointerDown={(e) => {
        if (isPassthroughTool) return;
        e.stopPropagation();

        if (props.tool !== 'image') return;

        props.onSelect();

        dragRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: props.obj.rect.x,
          startY: props.obj.rect.y,
          raf: null,
        };

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        const dxView = (e.clientX - d.startClientX) / props.zoom;
        const dyView = (e.clientY - d.startClientY) / props.zoom;
        const { dx, dy } = viewDeltaToUnrotatedDelta(dxView, dyView);
        scheduleCommit(d.startX + dx, d.startY + dy);
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        if (d.raf != null) cancelAnimationFrame(d.raf);
        d.raf = null;
        commitPending();
        dragRef.current = null;
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.max(1, Math.round(bounds.w))} ${Math.max(1, Math.round(bounds.h))}`}
        style={{ display: 'block' }}
      >
        <defs>
          <clipPath id={clipIds.crop} clipPathUnits="userSpaceOnUse">
            <rect x={cropRect.x} y={cropRect.y} width={cropRect.w} height={cropRect.h} />
          </clipPath>
          {mask.type !== 'none' ? (
            <clipPath id={clipIds.mask} clipPathUnits="userSpaceOnUse">
              <path d={maskD} />
            </clipPath>
          ) : null}
        </defs>

        <g clipPath={`url(#${clipIds.crop})`}>
          <g clipPath={mask.type !== 'none' ? `url(#${clipIds.mask})` : undefined} style={{ filter: filterCss }}>
            <image
              href={props.obj.src}
              xlinkHref={props.obj.src}
              crossOrigin="anonymous"
              x={0}
              y={0}
              width={Math.max(1, Math.round(bounds.w))}
              height={Math.max(1, Math.round(bounds.h))}
              preserveAspectRatio="xMidYMid meet"
              transform={imageTransform}
            />
          </g>

          {props.isSelected && mask.type !== 'none' ? (
            <path d={maskD} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
          ) : null}
        </g>
      </svg>

      {props.isSelected ? (
        <div
          className="imageResizeHandle"
          role="button"
          aria-label="Resize image"
          onPointerDown={(e) => {
            if (isPassthroughTool) return;
            e.stopPropagation();
            props.onSelect();

            if (props.tool !== 'image') return;

            resizeRef.current = {
              pointerId: e.pointerId,
              startClientX: e.clientX,
              startClientY: e.clientY,
              startW: props.obj.rect.w,
              startH: props.obj.rect.h,
              raf: null,
            };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const r = resizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;

            const minW = 40;
            const minH = 40;
            const dxView = (e.clientX - r.startClientX) / props.zoom;
            const dyView = (e.clientY - r.startClientY) / props.zoom;
            const { dx, dy } = viewDeltaToUnrotatedDelta(dxView, dyView);

            scheduleResizeCommit(Math.max(minW, r.startW + dx), Math.max(minH, r.startH + dy));
          }}
          onPointerUp={(e) => {
            const r = resizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }

            if (r.raf != null) cancelAnimationFrame(r.raf);
            r.raf = null;
            commitResizePending();
            resizeRef.current = null;
          }}
        />
      ) : null}
    </div>
  );
}

export default ImageBox;
