import { useEffect, useMemo, useRef } from 'react';
import type { PageRotation, TextObj, Tool } from '../state/types';

type Align = 'left' | 'center' | 'right';

function getTextDefaults(obj: TextObj) {
  const font = obj.font ?? {
    family: 'Helvetica',
    size: obj.fontSize ?? 16,
    bold: false,
    italic: false,
  };

  return {
    font,
    color: obj.color ?? '#111111',
    align: (obj.align ?? 'left') as Align,
    lineHeight: obj.lineHeight ?? 1.3,
    strike: obj.strike ?? false,
    background: obj.background ?? 'transparent',
    border: obj.border ?? { color: '#e5e5e5', width: 0, style: 'none' as const },
  };
}

export function TextBox(props: {
  pageIndex: number;
  obj: TextObj;
  viewRect?: { x: number; y: number; w: number; h: number };
  isSelected: boolean;
  isEditing: boolean;
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  pageRotation: PageRotation;
  pageSize: { w: number; h: number };
  onSelect: () => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onChangeText: (text: string) => void;
  onPatch: (patch: Partial<TextObj>) => void;
}) {
  const { font, color, align, lineHeight, strike, background, border } = getTextDefaults(props.obj);

  const isPassthroughTool =
    props.tool === 'highlight' ||
    props.tool === 'ink' ||
    props.tool === 'pages' ||
    props.tool === 'list' ||
    props.tool === 'shape';

  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const style = useMemo(() => {
    const r = props.viewRect ?? props.obj.rect;
    const left = r.x * props.zoom;
    const top = r.y * props.zoom;
    const width = r.w * props.zoom;
    const height = r.h * props.zoom;

    return {
      left,
      top,
      width,
      height,
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

  useEffect(() => {
    if (!props.isEditing) return;
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    // Put caret at end
    const len = t.value.length;
    try {
      t.setSelectionRange(len, len);
    } catch {
      // ignore
    }
  }, [props.isEditing]);

  // Dragging (when selected and not editing)
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    raf: number | null;
    pending?: { x: number; y: number };
  } | null>(null);

  // Resizing (bottom-right corner)
  const resizeRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
    raf: number | null;
    pending?: { w: number; h: number };
  } | null>(null);

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

  const commonTextStyle: React.CSSProperties = {
    fontFamily: font.family,
    fontSize: font.size * props.zoom,
    fontWeight: font.bold ? '700' : '400',
    fontStyle: font.italic ? 'italic' : 'normal',
    color,
    lineHeight: String(lineHeight),
    textAlign: align,
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
  };

  const decoration = strike ? 'line-through' : 'none';
  const borderWidth = Math.max(0, Number(border.width ?? 0));
  const borderStyle = (border.style ?? 'none') as any;
  const borderColor = border.color ?? '#e5e5e5';
  const borderCss =
    borderStyle === 'none' || borderWidth <= 0
      ? '1px solid transparent'
      : `${borderWidth}px ${borderStyle} ${borderColor}`;

  return (
    <div
      ref={rootRef}
      className={props.isSelected ? 'textBox selected' : 'textBox'}
      data-textbox-id={props.obj.id}
      style={{
        position: 'absolute',
        ...style,
        pointerEvents: isPassthroughTool ? 'none' : 'auto',
        background,
        border: borderCss,
        outline: props.isSelected ? '1px solid rgba(0,0,0,0.35)' : '1px solid transparent',
        outlineOffset: 2,
      }}
      onPointerDown={(e) => {
        if (isPassthroughTool) return;

        // Do not allow overlay root handlers to treat this as empty-space click.
        e.stopPropagation();

        // Only the Text tool should select/drag text boxes.
        if (props.tool !== 'text') return;

        props.onSelect();

        // Dragging: allow click-and-drag in one gesture.
        // (Selection state updates async, so don't require already-selected.)
        if (!props.isEditing) {
          dragRef.current = {
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: props.obj.rect.x,
            startY: props.obj.rect.y,
            raf: null,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
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

        // Flush pending
        if (d.raf != null) {
          cancelAnimationFrame(d.raf);
        }
        d.raf = null;
        commitPending();
        dragRef.current = null;
      }}
      onDoubleClick={(e) => {
        if (isPassthroughTool) return;
        e.stopPropagation();
        if (props.tool === 'text') props.onEditStart();
      }}
    >
      {props.isEditing ? (
        <textarea
          ref={textareaRef}
          className="textArea"
          value={props.obj.text}
          onChange={(e) => props.onChangeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              props.onEditEnd();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            resize: 'none',
            border: 'none',
            padding: 8,
            background: background === 'transparent' ? 'rgba(255,255,255,0.95)' : background,
            ...commonTextStyle,
            textDecoration: decoration,
          }}
          onPointerDown={(e) => {
            // Keep selection, avoid triggering placement.
            e.stopPropagation();
          }}
          onBlur={() => {
            // Click outside ends editing.
            props.onEditEnd();
          }}
        />
      ) : (
        <div
          className="textDisplay"
          style={{
            width: '100%',
            height: '100%',
            padding: 8,
            ...commonTextStyle,
            textDecoration: decoration,
            background: 'transparent',
          }}
        >
          {props.obj.text}
        </div>
      )}

      {props.isSelected ? (
        <div
          className="textResizeHandle"
          role="button"
          aria-label="Resize text box"
          onPointerDown={(e) => {
            // Resize should not trigger drag/placement.
            e.stopPropagation();
            props.onSelect();

            // Allow resize when selected (even if editing).
            if (props.tool !== 'text') return;

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

            const minW = 60;
            const minH = 28;
            const dw = (e.clientX - r.startClientX) / props.zoom;
            const dh = (e.clientY - r.startClientY) / props.zoom;

            scheduleResizeCommit(
              Math.max(minW, r.startW + dw),
              Math.max(minH, r.startH + dh),
            );
          }}
          onPointerUp={(e) => {
            const r = resizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }

            if (r.raf != null) {
              cancelAnimationFrame(r.raf);
            }
            r.raf = null;
            commitResizePending();
            resizeRef.current = null;
          }}
        />
      ) : null}
    </div>
  );
}
