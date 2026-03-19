import type { Op, OverlayObject, PdfDocModel } from './types';
import { reorderDocModelArrays } from '../pageops/reorder';

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function getOverlayPage(doc: PdfDocModel, pageIndex: number) {
  return doc.overlays[pageIndex] ?? { objects: [] };
}

export function applyOp(doc: PdfDocModel, op: Op): PdfDocModel {
  const now = Date.now();
  const next: PdfDocModel = {
    ...doc,
    meta: { ...doc.meta, updatedAt: now },
  };

  switch (op.type) {
    case 'overlay/add': {
      const page = getOverlayPage(next, op.pageIndex);
      const objects = [...page.objects, op.object];
      next.overlays = { ...next.overlays, [op.pageIndex]: { objects } };
      return next;
    }
    case 'overlay/remove': {
      const page = getOverlayPage(next, op.pageIndex);
      const objects = page.objects.filter((o) => o.id !== op.object.id);
      next.overlays = { ...next.overlays, [op.pageIndex]: { objects } };
      return next;
    }
    case 'overlay/update': {
      const page = getOverlayPage(next, op.pageIndex);
      const objects = page.objects.map((o) => (o.id === op.objectId ? (op.after as OverlayObject) : o));
      next.overlays = { ...next.overlays, [op.pageIndex]: { objects } };
      return next;
    }
    case 'page/reorder': {
      next.pageOrder = [...op.afterOrder];
      const remapped = reorderDocModelArrays(doc, op.beforeOrder, op.afterOrder);
      next.pageSizes = remapped.nextPageSizes;
      if (remapped.nextPageSizePoints) next.pageSizePoints = remapped.nextPageSizePoints;
      next.pageRotation = remapped.nextRotations;
      if (doc.pageCrop) next.pageCrop = remapped.nextCrops;
      next.overlays = remapped.nextOverlays;
      next.linksByPage = remapped.nextLinksByPage;
      return next;
    }
    case 'page/rotate': {
      const nextRot = [...next.pageRotation];
      nextRot[op.pageIndex] = op.after;
      next.pageRotation = nextRot;
      return next;
    }
    case 'page/delete': {
      const pageCount = Math.max(0, next.pageCount - 1);
      next.pageCount = pageCount;
      next.pageOrder = next.pageOrder.filter((_, i) => i !== op.pageIndex);
      next.pageSizes = next.pageSizes.filter((_, i) => i !== op.pageIndex);
      if (next.pageSizePoints) next.pageSizePoints = next.pageSizePoints.filter((_, i) => i !== op.pageIndex);
      next.pageRotation = next.pageRotation.filter((_, i) => i !== op.pageIndex);
      if (next.pageCrop) next.pageCrop = next.pageCrop.filter((_, i) => i !== op.pageIndex);
      const overlays: PdfDocModel['overlays'] = {};
      for (const [k, v] of Object.entries(next.overlays)) {
        const idx = Number(k);
        if (idx < op.pageIndex) overlays[idx] = v;
        else if (idx > op.pageIndex) overlays[idx - 1] = v;
      }
      next.overlays = overlays;

      const linksByPage: PdfDocModel['linksByPage'] = {};
      for (const [k, v] of Object.entries(next.linksByPage ?? {})) {
        const idx = Number(k);
        if (!Number.isFinite(idx)) continue;
        if (idx < op.pageIndex) {
          linksByPage[idx] = (v ?? []).map((m: any) => ({ ...m, pageIndex: idx }));
        } else if (idx > op.pageIndex) {
          linksByPage[idx - 1] = (v ?? []).map((m: any) => ({ ...m, pageIndex: idx - 1 }));
        }
      }
      next.linksByPage = linksByPage;

      return next;
    }
    default:
      return next;
  }
}

export function invertOp(_doc: PdfDocModel, op: Op): Op {
  switch (op.type) {
    case 'overlay/add':
      return { type: 'overlay/remove', pageIndex: op.pageIndex, object: op.object };
    case 'overlay/remove':
      return { type: 'overlay/add', pageIndex: op.pageIndex, object: op.object };
    case 'overlay/update':
      return {
        type: 'overlay/update',
        pageIndex: op.pageIndex,
        objectId: op.objectId,
        patch: op.patch,
        before: op.after,
        after: op.before,
      };
    case 'page/reorder':
      return {
        type: 'page/reorder',
        from: clampIndex(op.to, op.afterOrder.length),
        to: clampIndex(op.from, op.beforeOrder.length),
        beforeOrder: op.afterOrder,
        afterOrder: op.beforeOrder,
      };
    case 'page/rotate':
      return {
        type: 'page/rotate',
        pageIndex: op.pageIndex,
        before: op.after,
        after: op.before,
      };
    case 'page/delete':
      // TODO(Phase 2): represent delete as a reversible op with payload.
      return op;
    default:
      return op;
  }
}
