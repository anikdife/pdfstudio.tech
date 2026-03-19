import { useEffect, useMemo, useRef, useState } from 'react';
import type { LinkMark, LinkRect, OverlayObject, PageRotation, PageBackgroundObj } from '../state/types';
import { useDocumentStore } from '../state/documentStore';
import { useUiStore } from '../state/uiStore';
import { useInkTool } from '../tools/useInkTool';
import { useHighlightTool } from '../tools/useHighlightTool';
import { useTextTool } from '../tools/useTextTool';
import { useListTool } from '../tools/useListTool';
import { TextBox } from './TextBox';
import { ImageBox } from './ImageBox.tsx';
import { ListBox } from './ListBox';
import { ShapeLayer } from './ShapeLayer';
import PageBorder from './PageBorder';
import { clampCrop, cropToViewRect, fullPageCrop, viewPointToUnrotated, viewSizeForRotation } from '../pageops/crop';
import { screenToPage } from '../util/coords';

function drawOverlayCanvas(
  canvas: HTMLCanvasElement,
  objects: OverlayObject[],
  zoom: number,
  pageSize: { w: number; h: number },
  pageRotation: PageRotation,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const rotFwd = (x: number, y: number) => {
    switch (pageRotation) {
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

  const rectToViewBox = (r: { x: number; y: number; w: number; h: number }) => {
    const p1 = rotFwd(r.x, r.y);
    const p2 = rotFwd(r.x + r.w, r.y);
    const p3 = rotFwd(r.x, r.y + r.h);
    const p4 = rotFwd(r.x + r.w, r.y + r.h);
    const xs = [p1.x, p2.x, p3.x, p4.x];
    const ys = [p1.y, p2.y, p3.y, p4.y];
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return { x: left, y: top, w: right - left, h: bottom - top };
  };

  for (const obj of objects) {
    if (obj.type === 'highlight') {
      ctx.globalAlpha = obj.opacity;
      ctx.fillStyle = obj.color;
      const vr = rectToViewBox(obj.rect);
      ctx.fillRect(vr.x * zoom, vr.y * zoom, vr.w * zoom, vr.h * zoom);
      ctx.globalAlpha = 1;
    }

    if (obj.type === 'ink') {
      if (obj.points.length < 2) continue;
      ctx.globalAlpha = obj.opacity;
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = obj.width * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      const p0 = rotFwd(obj.points[0].x, obj.points[0].y);
      ctx.moveTo(p0.x * zoom, p0.y * zoom);
      for (let i = 1; i < obj.points.length; i++) {
        const pi = rotFwd(obj.points[i].x, obj.points[i].y);
        ctx.lineTo(pi.x * zoom, pi.y * zoom);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

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

export function OverlayLayer(props: {
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  pageIndex: number;
  pageSize: { w: number; h: number };
  pageRotation: PageRotation;
  zoom: number;
  pan: { x: number; y: number };
}) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [linkDraftRect, setLinkDraftRect] = useState<LinkRect | null>(null);
  const linkDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const linkMoveRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRect: LinkRect;
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw';
    raf: number | null;
    pending?: { rect: LinkRect };
    linkId: string;
  } | null>(null);

  const overlays = useDocumentStore(
    (s) => s.doc?.overlays[props.pageIndex]?.objects ?? [],
  );

  const linkMarks = useDocumentStore((s) => s.doc?.linksByPage?.[props.pageIndex] ?? []);
  const selectedLinkId = useDocumentStore((s) => s.selectedLinkId);
  const setSelectedLinkId = useDocumentStore((s) => s.setSelectedLinkId);
  const addLinkMark = useDocumentStore((s) => s.addLinkMark);
  const updateLinkMark = useDocumentStore((s) => s.updateLinkMark);
  const removeLinkMark = useDocumentStore((s) => s.removeLinkMark);
  const hitTestLink = useDocumentStore((s) => s.hitTestLink);
  const setActivePage = useDocumentStore((s) => s.setActivePage);

  const borderObj = useMemo(() => overlays.find((o) => o.type === 'pageBorder') as any, [overlays]);
  const bgObj = useMemo(() => overlays.find((o) => o.type === 'pageBackground') as PageBackgroundObj | undefined, [overlays]);

  const updateOverlayObject = useDocumentStore((s) => s.updateOverlayObject);
  const removeOverlayObject = useDocumentStore((s) => s.removeOverlayObject);

  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const toolProps = useUiStore((s) => s.toolProps);
  const selectedTextId = useUiStore((s) => s.selectedTextId);
  const editingTextId = useUiStore((s) => s.editingTextId);
  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const selectedListId = useUiStore((s) => s.selectedListId);
  const editingListId = useUiStore((s) => s.editingListId);
  const setSelectedTextId = useUiStore((s) => s.setSelectedTextId);
  const setEditingTextId = useUiStore((s) => s.setEditingTextId);
  const setSelectedImageId = useUiStore((s) => s.setSelectedImageId);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setEditingListId = useUiStore((s) => s.setEditingListId);

  const linkDestPick = useUiStore((s) => s.linkDestPick);
  const setLinkDestPick = useUiStore((s) => s.setLinkDestPick);

  const cropMode = useUiStore((s) => s.cropMode);
  const cropDraftByPage = useUiStore((s) => s.cropDraftByPage);
  const setCropDraft = useUiStore((s) => s.setCropDraft);

  const getCanvasRect = () => {
    const c = props.baseCanvasRef.current;
    return c ? c.getBoundingClientRect() : null;
  };

  const cropDragRef = useRef<{
    pointerId: number;
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw';
    startX: number;
    startY: number;
    startCrop: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  const cropDraft = useMemo(() => {
    if (!cropMode) return null;
    const pageW = props.pageSize.w;
    const pageH = props.pageSize.h;
    const existing = cropDraftByPage[props.pageIndex] ?? (useDocumentStore.getState().doc?.pageCrop?.[props.pageIndex] ?? null);
    return existing ?? fullPageCrop(pageW, pageH);
  }, [cropMode, cropDraftByPage, props.pageIndex, props.pageSize.h, props.pageSize.w]);

  const cropViewRectPx = useMemo(() => {
    if (!cropDraft) return null;
    const pageW = props.pageSize.w;
    const pageH = props.pageSize.h;
    const rect = cropToViewRect(cropDraft, pageW, pageH, props.pageRotation);
    return {
      left: rect.left * props.zoom,
      top: rect.top * props.zoom,
      width: (rect.right - rect.left) * props.zoom,
      height: (rect.bottom - rect.top) * props.zoom,
    };
  }, [cropDraft, props.pageRotation, props.pageSize.h, props.pageSize.w, props.zoom]);

  const cropHandlers = cropMode
    ? {
        onPointerDown: (ev: React.PointerEvent) => {
          if (!cropDraft) return;
          const rect = getCanvasRect();
          if (!rect) return;
          const target = ev.target as HTMLElement;
          const mode = (target.getAttribute('data-crophandle') as any) || 'move';

          const viewX = (ev.clientX - rect.left) / props.zoom;
          const viewY = (ev.clientY - rect.top) / props.zoom;
          const p = viewPointToUnrotated(viewX, viewY, props.pageSize.w, props.pageSize.h, props.pageRotation);

          cropDragRef.current = {
            pointerId: ev.pointerId,
            mode,
            startX: p.x,
            startY: p.y,
            startCrop: { ...cropDraft },
          };
          (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
          ev.preventDefault();
        },
        onPointerMove: (ev: React.PointerEvent) => {
          const drag = cropDragRef.current;
          if (!drag || drag.pointerId !== ev.pointerId) return;
          const rect = getCanvasRect();
          if (!rect) return;

          const viewX = (ev.clientX - rect.left) / props.zoom;
          const viewY = (ev.clientY - rect.top) / props.zoom;
          const p = viewPointToUnrotated(viewX, viewY, props.pageSize.w, props.pageSize.h, props.pageRotation);

          const dx = p.x - drag.startX;
          const dy = p.y - drag.startY;

          let next = { ...drag.startCrop };
          if (drag.mode === 'move') {
            next = {
              left: drag.startCrop.left + dx,
              right: drag.startCrop.right + dx,
              top: drag.startCrop.top + dy,
              bottom: drag.startCrop.bottom + dy,
            };
          } else {
            if (drag.mode === 'nw' || drag.mode === 'sw') next.left = drag.startCrop.left + dx;
            if (drag.mode === 'ne' || drag.mode === 'se') next.right = drag.startCrop.right + dx;
            if (drag.mode === 'nw' || drag.mode === 'ne') next.top = drag.startCrop.top + dy;
            if (drag.mode === 'sw' || drag.mode === 'se') next.bottom = drag.startCrop.bottom + dy;
          }

          next = clampCrop(next, props.pageSize.w, props.pageSize.h);
          setCropDraft(props.pageIndex, next as any);
          ev.preventDefault();
        },
        onPointerUp: (ev: React.PointerEvent) => {
          const drag = cropDragRef.current;
          if (!drag || drag.pointerId !== ev.pointerId) return;
          cropDragRef.current = null;
          try {
            (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
          } catch {
            // ignore
          }
          ev.preventDefault();
        },
      }
    : {};

  const inkHandlers = useInkTool({
    enabled: tool === 'ink',
    pageIndex: props.pageIndex,
    pageSize: props.pageSize,
    pageRotation: props.pageRotation,
    zoom: props.zoom,
    pan: props.pan,
    getCanvasRect,
    color: toolProps.color,
    width: toolProps.width,
    opacity: toolProps.opacity,
  });

  const hlHandlers = useHighlightTool({
    enabled: tool === 'highlight',
    pageIndex: props.pageIndex,
    pageSize: props.pageSize,
    pageRotation: props.pageRotation,
    zoom: props.zoom,
    pan: props.pan,
    getCanvasRect,
    color: toolProps.color,
    opacity: toolProps.opacity,
  });

  const textHandlers = useTextTool({
    enabled: tool === 'text',
    pageIndex: props.pageIndex,
    pageSize: props.pageSize,
    pageRotation: props.pageRotation,
    zoom: props.zoom,
    pan: props.pan,
    getCanvasRect,
    color: toolProps.color,
    fontSize: toolProps.fontSize,
  });

  const listHandlers = useListTool({
    enabled: tool === 'list',
    pageIndex: props.pageIndex,
    pageSize: props.pageSize,
    pageRotation: props.pageRotation,
    zoom: props.zoom,
    pan: props.pan,
    getCanvasRect,
  });

  const handlers = useMemo(() => {
    return {
      ...(inkHandlers as any),
      ...(hlHandlers as any),
      ...(textHandlers as any),
      ...(listHandlers as any),
    };
  }, [inkHandlers, hlHandlers, textHandlers, listHandlers]);

  const linkHandlers = useMemo(() => {
    if (tool !== 'link') return {};

    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = getCanvasRect();
        if (!rect) return;

        const p = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          props.zoom,
          props.pan,
          props.pageRotation,
          props.pageSize,
        );

        const hit = hitTestLink(props.pageIndex, p);
        if (hit) {
          setSelectedLinkId(hit.id);
          setLinkDraftRect(null);
          linkDragRef.current = null;
          return;
        }

        setSelectedLinkId(null);
        setLinkDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
        linkDragRef.current = { pointerId: e.pointerId, startX: p.x, startY: p.y };
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        e.preventDefault();
      },
      onPointerMove: (e: React.PointerEvent) => {
        const drag = linkDragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const rect = getCanvasRect();
        if (!rect) return;

        const p = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          props.zoom,
          props.pan,
          props.pageRotation,
          props.pageSize,
        );

        setLinkDraftRect({ x: drag.startX, y: drag.startY, w: p.x - drag.startX, h: p.y - drag.startY });
        e.preventDefault();
      },
      onPointerUp: (e: React.PointerEvent) => {
        const drag = linkDragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        linkDragRef.current = null;

        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        const r = linkDraftRect;
        setLinkDraftRect(null);
        if (!r) return;

        const w = Math.abs(r.w);
        const h = Math.abs(r.h);
        if (w < 4 || h < 4) return;

        addLinkMark(props.pageIndex, r, { kind: 'external', url: '' });
        e.preventDefault();
      },
    };
  }, [
    addLinkMark,
    getCanvasRect,
    hitTestLink,
    linkDraftRect,
    props.pageIndex,
    props.pageRotation,
    props.pageSize,
    props.pan,
    props.zoom,
    setSelectedLinkId,
    tool,
  ]);

  const pickHandlers = useMemo(() => {
    if (!linkDestPick) return {};
    if (linkDestPick.destPageIndex !== props.pageIndex) return {};

    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const rect = getCanvasRect();
        if (!rect) return;

        const p = screenToPage(
          { clientX: e.clientX, clientY: e.clientY },
          rect,
          props.zoom,
          props.pan,
          props.pageRotation,
          props.pageSize,
        );

        const curDoc = useDocumentStore.getState().doc;
        const allMarks = Object.values(curDoc?.linksByPage ?? {}).flat() as any[];
        const mark = allMarks.find((m) => m?.id === linkDestPick.linkId) as any;
        const curTarget = mark?.target;

        const nextTarget = {
          kind: 'internal' as const,
          pageIndex: linkDestPick.destPageIndex,
          x: p.x,
          y: p.y,
          ...(curTarget && curTarget.kind === 'internal' && Number.isFinite(curTarget.zoom)
            ? { zoom: curTarget.zoom }
            : null),
        };

        updateLinkMark(linkDestPick.linkId, { target: nextTarget } as any);
        setLinkDestPick(null);
        setTool(linkDestPick.returnTool);

        e.preventDefault();
        e.stopPropagation();
      },
    };
  }, [
    getCanvasRect,
    linkDestPick,
    props.pageIndex,
    props.pageRotation,
    props.pageSize,
    props.pan,
    props.zoom,
    setLinkDestPick,
    setTool,
    updateLinkMark,
  ]);

  const mergedHandlers = useMemo(
    () => ({ ...(handlers as any), ...(linkHandlers as any), ...(pickHandlers as any) }),
    [handlers, linkHandlers, pickHandlers],
  );

  useEffect(() => {
    const base = props.baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!base || !overlay) return;

    // Match CSS size to base canvas
    overlay.style.width = base.style.width;
    overlay.style.height = base.style.height;

    drawOverlayCanvas(overlay, overlays, props.zoom, props.pageSize, props.pageRotation);
  }, [props.baseCanvasRef, overlays, props.zoom, props.pageIndex, props.pageRotation, props.pageSize.h, props.pageSize.w]);

  const textObjects = overlays.filter((o) => o.type === 'text') as any[];
  const imageObjects = overlays.filter((o) => o.type === 'image') as any[];
  const listObjects = overlays.filter((o) => o.type === 'list') as any[];

  const cleanupEmptyTextBefore = (targetId: string) => {
    // Delete empty text objects that were created before the selected one (same page).
    const idx = overlays.findIndex((o) => o.type === 'text' && o.id === targetId);
    if (idx <= 0) return;
    const toRemove: string[] = [];
    for (let i = 0; i < idx; i++) {
      const o = overlays[i];
      if (o.type !== 'text') continue;
      const t = String((o as any).text ?? '').trim();
      if (t.length === 0) toRemove.push(o.id);
    }
    for (const id of toRemove) {
      removeOverlayObject(props.pageIndex, id);
    }
  };

  // Click-outside to end editing (keeps text).
  useEffect(() => {
    if (!editingTextId) return;

    const onDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      const inTextBox = target.closest(`[data-textbox-id="${editingTextId}"]`);
      const inToolbar = target.closest('[data-text-toolbar]');
      if (inTextBox || inToolbar) return;

      setEditingTextId(null);
    };

    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [editingTextId, setEditingTextId]);

  // Click-outside to end list editing (keeps content).
  useEffect(() => {
    if (!editingListId) return;

    const onDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      const inListBox = target.closest(`[data-listbox-id="${editingListId}"]`);
      const inToolbar = target.closest('[data-list-toolbar]');
      if (inListBox || inToolbar) return;

      setEditingListId(null);
    };

    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [editingListId, setEditingListId]);

  // ESC to end editing, Delete to remove selected (optional).
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTypingTarget =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target ? (target as any).isContentEditable : false);

      if (ev.key === 'Escape' && editingTextId) {
        ev.preventDefault();
        setEditingTextId(null);
      }
      if (
        !isTypingTarget &&
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        selectedTextId &&
        !editingTextId &&
        !editingListId
      ) {
        // Optional per spec: delete when selected and not editing.
        removeOverlayObject(props.pageIndex, selectedTextId);
        setSelectedTextId(null);
      }

      if (ev.key === 'Escape' && editingListId) {
        ev.preventDefault();
        setEditingListId(null);
      }
      if (
        !isTypingTarget &&
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        selectedListId &&
        !editingListId &&
        !editingTextId
      ) {
        removeOverlayObject(props.pageIndex, selectedListId);
        setSelectedListId(null);
      }

      if (ev.key === 'Escape' && selectedLinkId) {
        ev.preventDefault();
        setSelectedLinkId(null);
      }
      if (
        !isTypingTarget &&
        (ev.key === 'Delete' || ev.key === 'Backspace') &&
        selectedLinkId &&
        !editingTextId &&
        !editingListId &&
        (tool === 'link' || Boolean(selectedLinkId))
      ) {
        removeLinkMark(selectedLinkId);
        setSelectedLinkId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    editingTextId,
    selectedTextId,
    editingListId,
    selectedListId,
    selectedLinkId,
    removeOverlayObject,
    removeLinkMark,
    props.pageIndex,
    setEditingTextId,
    setSelectedTextId,
    setEditingListId,
    setSelectedListId,
    setSelectedLinkId,
    tool,
  ]);

  const linkViewRects = useMemo(() => {
    const out: Array<{ mark: LinkMark; viewRect: { x: number; y: number; w: number; h: number } }> = [];
    for (const m of linkMarks) {
      out.push({ mark: m, viewRect: rectToViewRect(m.rect, props.pageSize, props.pageRotation) });
    }
    return out;
  }, [linkMarks, props.pageRotation, props.pageSize]);

  const commitLinkMovePending = () => {
    const drag = linkMoveRef.current;
    if (!drag || !drag.pending) return;
    const next = drag.pending.rect;
    drag.pending = undefined;
    updateLinkMark(drag.linkId, { rect: next } as any);
  };

  return (
    <div
      className="overlayRoot"
      {...(mergedHandlers as any)}
    >
      {bgObj?.src ? (
        <div className="pageBackgroundLayer" aria-hidden="true">
          <img
            src={bgObj.src}
            alt=""
            style={{ opacity: bgObj.opacity == null ? 1 : Math.max(0, Math.min(1, Number(bgObj.opacity))) }}
          />
        </div>
      ) : null}
      <canvas ref={overlayCanvasRef} className="overlayCanvas" />
      <div className="overlayTextLayer">
        {borderObj ? (
          <PageBorder
            style={borderObj.style}
            color={borderObj.color}
            strokeWidth={borderObj.strokeWidth}
            width={viewSizeForRotation(props.pageSize.w, props.pageSize.h, props.pageRotation).w}
            height={viewSizeForRotation(props.pageSize.w, props.pageSize.h, props.pageRotation).h}
          />
        ) : null}

        <ShapeLayer
          pageIndex={props.pageIndex}
          pageSize={props.pageSize}
          pageRotation={props.pageRotation}
          zoom={props.zoom}
          pan={props.pan}
          tool={tool}
          getCanvasRect={getCanvasRect}
        />

        {tool === 'link' && linkDraftRect ? (
          (() => {
            const r = linkDraftRect;
            const normalized: LinkRect = {
              x: r.w < 0 ? r.x + r.w : r.x,
              y: r.h < 0 ? r.y + r.h : r.y,
              w: Math.abs(r.w),
              h: Math.abs(r.h),
            };
            const vr = rectToViewRect(normalized, props.pageSize, props.pageRotation);
            const left = vr.x * props.zoom;
            const top = vr.y * props.zoom;
            const width = vr.w * props.zoom;
            const height = vr.h * props.zoom;
            return (
              <div
                className="linkMark draft"
                aria-hidden="true"
                style={{ left, top, width, height }}
              />
            );
          })()
        ) : null}

        {linkViewRects.map(({ mark, viewRect }) => {
          const isSelected = mark.id === selectedLinkId;
          const clickable = tool === 'pages' && !cropMode;
          const left = viewRect.x * props.zoom;
          const top = viewRect.y * props.zoom;
          const width = viewRect.w * props.zoom;
          const height = viewRect.h * props.zoom;

          const beginMove = (ev: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'se' | 'sw') => {
            if (tool !== 'link') return;
            if (ev.button !== 0) return;
            const rect = getCanvasRect();
            if (!rect) return;

            const p = screenToPage(
              { clientX: ev.clientX, clientY: ev.clientY },
              rect,
              props.zoom,
              props.pan,
              props.pageRotation,
              props.pageSize,
            );

            setSelectedLinkId(mark.id);

            linkMoveRef.current = {
              pointerId: ev.pointerId,
              startX: p.x,
              startY: p.y,
              startRect: { ...mark.rect },
              mode,
              raf: null,
              linkId: mark.id,
            };

            try {
              const cur = ev.currentTarget as HTMLElement;
              const captureEl = cur.classList.contains('linkMarkHandle') ? (cur.parentElement ?? cur) : cur;
              captureEl.setPointerCapture(ev.pointerId);
            } catch {
              // ignore
            }
            ev.preventDefault();
            ev.stopPropagation();
          };

          const onMove = (ev: React.PointerEvent) => {
            const drag = linkMoveRef.current;
            if (!drag || drag.pointerId !== ev.pointerId) return;
            const rect = getCanvasRect();
            if (!rect) return;

            const p = screenToPage(
              { clientX: ev.clientX, clientY: ev.clientY },
              rect,
              props.zoom,
              props.pan,
              props.pageRotation,
              props.pageSize,
            );

            const dx = p.x - drag.startX;
            const dy = p.y - drag.startY;

            let next: LinkRect = { ...drag.startRect };
            const minSize = 6;

            if (drag.mode === 'move') {
              next = { ...drag.startRect, x: drag.startRect.x + dx, y: drag.startRect.y + dy };
            } else {
              const x1 = drag.startRect.x;
              const y1 = drag.startRect.y;
              const x2 = drag.startRect.x + drag.startRect.w;
              const y2 = drag.startRect.y + drag.startRect.h;

              let nx1 = x1;
              let ny1 = y1;
              let nx2 = x2;
              let ny2 = y2;

              if (drag.mode === 'nw' || drag.mode === 'sw') nx1 = x1 + dx;
              if (drag.mode === 'ne' || drag.mode === 'se') nx2 = x2 + dx;
              if (drag.mode === 'nw' || drag.mode === 'ne') ny1 = y1 + dy;
              if (drag.mode === 'sw' || drag.mode === 'se') ny2 = y2 + dy;

              if (Math.abs(nx2 - nx1) < minSize) {
                if (drag.mode === 'nw' || drag.mode === 'sw') nx1 = nx2 - minSize;
                else nx2 = nx1 + minSize;
              }
              if (Math.abs(ny2 - ny1) < minSize) {
                if (drag.mode === 'nw' || drag.mode === 'ne') ny1 = ny2 - minSize;
                else ny2 = ny1 + minSize;
              }

              next = { x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 };
            }

            const size = props.pageSize;
            // Clamp to page bounds
            next = {
              x: Math.max(0, Math.min(size.w, next.x)),
              y: Math.max(0, Math.min(size.h, next.y)),
              w: next.w,
              h: next.h,
            };

            drag.pending = { rect: next };
            if (drag.raf == null) {
              drag.raf = window.requestAnimationFrame(() => {
                const d = linkMoveRef.current;
                if (!d) return;
                d.raf = null;
                commitLinkMovePending();
              });
            }

            ev.preventDefault();
            ev.stopPropagation();
          };

          const onUp = (ev: React.PointerEvent) => {
            const drag = linkMoveRef.current;
            if (!drag || drag.pointerId !== ev.pointerId) return;
            if (drag.raf != null) {
              try {
                window.cancelAnimationFrame(drag.raf);
              } catch {
                // ignore
              }
              drag.raf = null;
            }
            commitLinkMovePending();
            linkMoveRef.current = null;
            try {
              (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
            } catch {
              // ignore
            }
            ev.preventDefault();
            ev.stopPropagation();
          };

          const openLink = () => {
            if (!clickable) return;
            const t = mark.target as any;
            if (t?.kind === 'external') {
              const url = String(t.url || '').trim();
              if (!url) return;
              try {
                window.open(url, '_blank', 'noopener,noreferrer');
              } catch {
                // ignore
              }
              return;
            }
            if (t?.kind === 'internal') {
              const idx = Math.max(0, Math.min((useDocumentStore.getState().doc?.pageCount ?? 1) - 1, Number(t.pageIndex) || 0));
              setActivePage(idx);
            }
          };

          return (
            <div
              key={mark.id}
              className={
                `linkMark${isSelected ? ' selected' : ''}${clickable ? ' clickable' : ''}${tool === 'link' ? ' editing' : ''}`
              }
              style={{ left, top, width, height }}
              role={clickable ? 'link' : undefined}
              tabIndex={clickable ? 0 : -1}
              onClick={(e) => {
                if (tool === 'link') return;
                e.stopPropagation();
                openLink();
              }}
              onPointerDown={(ev) => {
                if (tool === 'link') {
                  setSelectedLinkId(mark.id);
                  beginMove(ev, 'move');
                  return;
                }
                if (clickable) {
                  ev.stopPropagation();
                }
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLink();
                }
              }}
            >
              {tool === 'link' && isSelected ? (
                <>
                  <div className="linkMarkHandle nw" onPointerDown={(ev) => beginMove(ev, 'nw')} />
                  <div className="linkMarkHandle ne" onPointerDown={(ev) => beginMove(ev, 'ne')} />
                  <div className="linkMarkHandle sw" onPointerDown={(ev) => beginMove(ev, 'sw')} />
                  <div className="linkMarkHandle se" onPointerDown={(ev) => beginMove(ev, 'se')} />
                </>
              ) : null}
            </div>
          );
        })}

        {cropMode && cropViewRectPx ? (
          <div className="pageCropOverlay" {...(cropHandlers as any)}>
            <div
              className="pageCropRect"
              style={{
                left: cropViewRectPx.left,
                top: cropViewRectPx.top,
                width: cropViewRectPx.width,
                height: cropViewRectPx.height,
              }}
            >
              <div className="cropHandle nw" data-crophandle="nw" />
              <div className="cropHandle ne" data-crophandle="ne" />
              <div className="cropHandle sw" data-crophandle="sw" />
              <div className="cropHandle se" data-crophandle="se" />
            </div>
          </div>
        ) : null}

        {textObjects.map((o) => (
          <TextBox
            key={o.id}
            pageIndex={props.pageIndex}
            obj={o}
            viewRect={rectToViewRect(o.rect, props.pageSize, props.pageRotation)}
            isSelected={o.id === selectedTextId}
            isEditing={o.id === editingTextId}
            tool={tool}
            zoom={props.zoom}
            pan={props.pan}
            pageRotation={props.pageRotation}
            pageSize={props.pageSize}
            onSelect={() => {
              cleanupEmptyTextBefore(o.id);
              setSelectedTextId(o.id);
              setSelectedListId(null);
              setEditingListId(null);
            }}
            onEditStart={() => {
              cleanupEmptyTextBefore(o.id);
              setSelectedTextId(o.id);
              setEditingTextId(o.id);
              setSelectedListId(null);
              setEditingListId(null);
            }}
            onEditEnd={() => {
              setEditingTextId(null);
            }}
            onChangeText={(text) => {
              updateOverlayObject(props.pageIndex, o.id, { text } as any);
            }}
            onPatch={(patch) => {
              updateOverlayObject(props.pageIndex, o.id, patch as any);
            }}
          />
        ))}

        {imageObjects.map((o) => (
          <ImageBox
            key={o.id}
            obj={o}
            viewRect={rectToViewRect(o.rect, props.pageSize, props.pageRotation)}
            isSelected={o.id === selectedImageId}
            tool={tool}
            zoom={props.zoom}
            pageRotation={props.pageRotation}
            pageSize={props.pageSize}
            onSelect={() => {
              setSelectedImageId(o.id);
              setSelectedListId(null);
              setEditingListId(null);
            }}
            onPatch={(patch: Partial<OverlayObject>) => {
              updateOverlayObject(props.pageIndex, o.id, patch as any);
            }}
          />
        ))}

        {listObjects.map((o) => (
          <ListBox
            key={o.id}
            pageIndex={props.pageIndex}
            obj={o}
            viewRect={rectToViewRect(o.rect, props.pageSize, props.pageRotation)}
            isSelected={o.id === selectedListId}
            isEditing={o.id === editingListId}
            tool={tool}
            zoom={props.zoom}
            pan={props.pan}
            pageRotation={props.pageRotation}
            pageSize={props.pageSize}
            onSelect={() => {
              setSelectedListId(o.id);
              setEditingListId(null);
              setSelectedTextId(null);
              setEditingTextId(null);
              setSelectedImageId(null);
            }}
            onEditStart={() => {
              setSelectedListId(o.id);
              setEditingListId(o.id);
              setSelectedTextId(null);
              setEditingTextId(null);
              setSelectedImageId(null);
            }}
            onEditEnd={() => {
              setEditingListId(null);
            }}
            onPatch={(patch) => {
              updateOverlayObject(props.pageIndex, o.id, patch as any);
            }}
          />
        ))}
      </div>
    </div>
  );
}
