import { useEffect, useMemo, useRef, useState } from 'react';
import type { ListObj, PageRotation, Tool } from '../state/types';
import { createId } from '../util/ids';
import { formatListMarker, isOrderedListType } from '../util/listMarkers';

type Align = 'left' | 'center' | 'right';

function getListDefaults(obj: ListObj) {
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
    listType: obj.listType ?? 'bullet',
    startNumber: Math.max(1, Number(obj.startNumber ?? 1) || 1),
    indentSize: Math.max(0, Number(obj.indentSize ?? 18) || 18),
  };
}

function itemsToText(items: ListObj['items']): string {
  return (items ?? []).map((it) => String(it.text ?? '')).join('\n');
}

function textToItems(prev: ListObj['items'], text: string): ListObj['items'] {
  const lines = String(text ?? '').split(/\r?\n/);
  const next: ListObj['items'] = [];
  for (let i = 0; i < lines.length; i++) {
    const existing = prev?.[i];
    next.push({
      id: existing?.id ?? createId('li'),
      text: lines[i],
      indentLevel: existing?.indentLevel ?? 0,
      checked: existing?.checked,
    });
  }
  return next;
}

export function ListBox(props: {
  pageIndex: number;
  obj: ListObj;
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
  onPatch: (patch: Partial<ListObj>) => void;
}) {
  const { font, color, align, lineHeight, strike, listType, startNumber, indentSize } = getListDefaults(props.obj);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [draftText, setDraftText] = useState('');
  const [draftItems, setDraftItems] = useState<ListObj['items']>(props.obj.items ?? []);
  const draftItemsRef = useRef<ListObj['items']>(props.obj.items ?? []);
  const commitTimerRef = useRef<number | null>(null);

  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const isPassthroughTool =
    props.tool === 'highlight' ||
    props.tool === 'ink' ||
    props.tool === 'pages' ||
    props.tool === 'text' ||
    props.tool === 'image' ||
    props.tool === 'shape';

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

  useEffect(() => {
    if (!props.isEditing) return;
    // Sync draft from store when entering edit mode.
    const initial = itemsToText(props.obj.items ?? []);
    setDraftText(initial);
    const initialItems = props.obj.items ?? [];
    setDraftItems(initialItems);
    draftItemsRef.current = initialItems;
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

  const scheduleCommitItems = (nextItems: ListObj['items']) => {
    setDraftItems(nextItems);
    draftItemsRef.current = nextItems;
    if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      props.onPatch({ items: draftItemsRef.current } as any);
    }, 200);
  };

  const flushCommit = () => {
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    props.onPatch({ items: draftItemsRef.current } as any);
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
    overflowWrap: 'anywhere',
  };

  const decoration = strike ? 'line-through' : 'none';

  // Marker column sizing for edit mode overlay.
  const markerGap = 10 * props.zoom;
  const markerColW = useMemo(() => {
    if (isOrderedListType(listType as any)) {
      const lastIdx = Math.max(0, (draftItems?.length ?? 1) - 1);
      const lastMarker = formatListMarker({
        listType: listType as any,
        index: lastIdx,
        startNumber,
        checked: false,
        mode: 'ui',
      });
      const approxCharW = 8;
      return Math.max(28, (lastMarker.length * approxCharW + 16) * props.zoom);
    }
    // Unordered/checkbox
    return Math.max(24, 28 * props.zoom);
  }, [draftItems?.length, listType, props.zoom, startNumber]);

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

  const markerForIndex = (idx: number, checked?: boolean) =>
    formatListMarker({ listType: listType as any, index: idx, startNumber, checked, mode: 'ui' });

  const toggleCheckboxAt = (idx: number) => {
    if (listType !== 'checkbox') return;
    const items = props.obj.items ?? [];
    const target = items[idx];
    if (!target) return;
    const next = items.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it));
    props.onPatch({ items: next } as any);
  };

  const adjustIndentAt = (delta: 1 | -1, idx: number | null) => {
    const items = (props.isEditing ? draftItemsRef.current : (props.obj.items ?? [])) ?? [];
    if (items.length === 0) return;

    if (idx == null || idx < 0 || idx >= items.length) {
      // Fallback: indent all
      const next = items.map((it) => ({
        ...it,
        indentLevel: Math.max(0, (Number(it.indentLevel) || 0) + delta),
      }));
      if (props.isEditing) scheduleCommitItems(next);
      else props.onPatch({ items: next } as any);
      return;
    }

    const next = items.map((it, i) =>
      i === idx ? { ...it, indentLevel: Math.max(0, (Number(it.indentLevel) || 0) + delta) } : it,
    );
    if (props.isEditing) scheduleCommitItems(next);
    else props.onPatch({ items: next } as any);
  };

  const updateActiveLineFromTextarea = () => {
    const t = textareaRef.current;
    if (!t) return;
    const pos = t.selectionStart ?? 0;
    const before = t.value.slice(0, pos);
    const line = before.split(/\r?\n/).length - 1;
    setActiveLineIndex(Math.max(0, line));
  };

  return (
    <div
      ref={rootRef}
      className={props.isSelected ? 'listBox selected' : 'listBox'}
      data-listbox-id={props.obj.id}
      style={{
        position: 'absolute',
        ...style,
        pointerEvents: isPassthroughTool ? 'none' : 'auto',
        background: props.isEditing ? 'rgba(255,255,255,0.95)' : 'transparent',
        border: '1px solid transparent',
        outline: props.isSelected ? '1px solid rgba(0,0,0,0.35)' : '1px solid transparent',
        outlineOffset: 2,
      }}
      onPointerDown={(e) => {
        if (isPassthroughTool) return;
        e.stopPropagation();

        // Only list tool should select/drag list boxes.
        if (props.tool !== 'list') return;

        props.onSelect();

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
        if (d.raf != null) cancelAnimationFrame(d.raf);
        d.raf = null;
        commitPending();
        dragRef.current = null;
      }}
      onDoubleClick={(e) => {
        if (isPassthroughTool) return;
        e.stopPropagation();
        if (props.tool === 'list') props.onEditStart();
      }}
    >
      {props.isEditing ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Marker overlay so bullets/numbers stay visible while typing */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              padding: 8,
              pointerEvents: 'none',
              ...commonTextStyle,
              textDecoration: decoration,
              color,
            }}
          >
            {(draftItems ?? []).map((it, idx) => {
              const indentPx = (Number(it.indentLevel) || 0) * indentSize * props.zoom;
              const marker = markerForIndex(idx, it.checked);
              return (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: markerGap,
                    paddingLeft: indentPx,
                    minHeight: Math.max(1, font.size * props.zoom * (lineHeight || 1.3)),
                  }}
                >
                  <span style={{ flex: `0 0 ${markerColW}px`, textAlign: align === 'right' ? 'right' : 'left' }}>{marker}</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }} />
                </div>
              );
            })}
          </div>

          <textarea
            ref={textareaRef}
            className="textArea"
            value={draftText}
            onChange={(e) => {
              const nextText = e.target.value;
              setDraftText(nextText);
              const base = draftItemsRef.current ?? (props.obj.items ?? []);
              const nextItems = textToItems(base, nextText);
              scheduleCommitItems(nextItems);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                flushCommit();
                props.onEditEnd();
                return;
              }
              if (e.key === 'Tab') {
                // Optional Phase 1: Tab/Shift+Tab indent active line.
                e.preventDefault();
                flushCommit();
                adjustIndentAt(e.shiftKey ? -1 : 1, activeLineIndex);
                return;
              }
            }}
            onSelect={() => updateActiveLineFromTextarea()}
            onClick={() => updateActiveLineFromTextarea()}
            onKeyUp={() => updateActiveLineFromTextarea()}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onBlur={() => {
              flushCommit();
              props.onEditEnd();
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              resize: 'none',
              border: 'none',
              paddingTop: 8,
              paddingBottom: 8,
              paddingRight: 8,
              paddingLeft: 8 + markerColW + markerGap,
              background: 'transparent',
              ...commonTextStyle,
              textDecoration: decoration,
            }}
          />
        </div>
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
            overflow: 'hidden',
          }}
        >
          {(props.obj.items ?? []).map((it, idx) => {
            const indentPx = (Number(it.indentLevel) || 0) * indentSize * props.zoom;
            const marker = markerForIndex(idx, it.checked);
            const isCheckbox = listType === 'checkbox';
            return (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: markerGap,
                  paddingLeft: indentPx,
                  cursor: isCheckbox ? 'pointer' : 'default',
                }}
                onClick={(e) => {
                  if (!isCheckbox) return;
                  if (props.tool !== 'list') return;
                  e.stopPropagation();
                  toggleCheckboxAt(idx);
                }}
              >
                <span style={{ flex: '0 0 auto' }}>{marker}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>{it.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* TODO Phase 2: resize handles, better marker alignment for wrapped lines. */}
    </div>
  );
}
