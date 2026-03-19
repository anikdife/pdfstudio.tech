import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from './pdfjs';
import type { OverlayObject, TextObj, ImageObj, InkObj, HighlightObj, ListObj, PageBorderObj, BorderStyle, PageBackgroundObj } from '../state/types';
import { getCachedMaskPathD } from '../util/masks';
import { formatListMarker } from '../util/listMarkers';

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function borderToSvgMarkup(params: {
  style: BorderStyle;
  color: string;
  strokeWidth: number;
  pageW: number;
  pageH: number;
}): string {
  const color = escapeXml(params.color);
  const sw = Math.max(0.5, Number(params.strokeWidth) || 2);
  const w = params.pageW;
  const h = params.pageH;
  const padding = 20;

  switch (params.style) {
    case 'corporate':
      return (
        `<g>` +
        `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw * 2}" />` +
        `<rect x="${padding + 5}" y="${padding + 5}" width="${w - padding * 2 - 10}" height="${h - padding * 2 - 10}" fill="none" stroke="${color}" stroke-width="${sw / 2}" />` +
        `</g>`
      );

    case 'modern-accent': {
      const len = 40;
      const s = sw * 1.5;
      return (
        `<g stroke="${color}" stroke-width="${s}" fill="none">` +
        `<path d="M${padding},${padding + len} V${padding} H${padding + len}" />` +
        `<path d="M${w - padding - len},${padding} H${w - padding} V${padding + len}" />` +
        `<path d="M${padding},${h - padding - len} V${h - padding} H${padding + len}" />` +
        `<path d="M${w - padding - len},${h - padding} H${w - padding} V${h - padding - len}" />` +
        `</g>`
      );
    }

    case 'classic-frame': {
      const notch = 15;
      const d = [
        `M ${padding + notch} ${padding}`,
        `H ${w - padding - notch}`,
        `L ${w - padding} ${padding + notch}`,
        `V ${h - padding - notch}`,
        `L ${w - padding - notch} ${h - padding}`,
        `H ${padding + notch}`,
        `L ${padding} ${h - padding - notch}`,
        `V ${padding + notch} Z`,
      ].join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" />`;
    }

    case 'minimalist':
      return (
        `<g>` +
        `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw / 2}" stroke-dasharray="4 2" />` +
        `<circle cx="${padding}" cy="${padding}" r="3" fill="${color}" />` +
        `<circle cx="${w - padding}" cy="${padding}" r="3" fill="${color}" />` +
        `<circle cx="${padding}" cy="${h - padding}" r="3" fill="${color}" />` +
        `<circle cx="${w - padding}" cy="${h - padding}" r="3" fill="${color}" />` +
        `</g>`
      );

    case 'ornate-corners': {
      const x0 = padding;
      const y0 = padding;
      const x1 = w - padding;
      const y1 = h - padding;
      const inset = 10;
      const curl = 24;
      const s1 = Math.max(1, sw);
      const s2 = Math.max(1, sw / 2);
      const s3 = Math.max(1, sw * 0.9);
      const s4 = Math.max(1, sw * 0.7);
      return (
        `<g fill="none" stroke="${color}" stroke-width="${s1}" stroke-linecap="round" stroke-linejoin="round">` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="2" />` +
        `<rect x="${x0 + inset}" y="${y0 + inset}" width="${x1 - x0 - inset * 2}" height="${y1 - y0 - inset * 2}" rx="2" opacity="0.55" stroke-width="${s2}" />` +
        `<path d="M${x0 + 10},${y0 + curl} C${x0 + 10},${y0 + 10} ${x0 + curl},${y0 + 10} ${x0 + curl},${y0 + 10}" stroke-width="${s3}" />` +
        `<path d="M${x0 + curl},${y0 + 10} C${x0 + curl + 14},${y0 + 10} ${x0 + curl + 14},${y0 + 24} ${x0 + 12},${y0 + 24}" stroke-width="${s4}" opacity="0.8" />` +
        `<path d="M${x1 - 10},${y0 + curl} C${x1 - 10},${y0 + 10} ${x1 - curl},${y0 + 10} ${x1 - curl},${y0 + 10}" stroke-width="${s3}" />` +
        `<path d="M${x1 - curl},${y0 + 10} C${x1 - curl - 14},${y0 + 10} ${x1 - curl - 14},${y0 + 24} ${x1 - 12},${y0 + 24}" stroke-width="${s4}" opacity="0.8" />` +
        `<path d="M${x0 + 10},${y1 - curl} C${x0 + 10},${y1 - 10} ${x0 + curl},${y1 - 10} ${x0 + curl},${y1 - 10}" stroke-width="${s3}" />` +
        `<path d="M${x0 + curl},${y1 - 10} C${x0 + curl + 14},${y1 - 10} ${x0 + curl + 14},${y1 - 24} ${x0 + 12},${y1 - 24}" stroke-width="${s4}" opacity="0.8" />` +
        `<path d="M${x1 - 10},${y1 - curl} C${x1 - 10},${y1 - 10} ${x1 - curl},${y1 - 10} ${x1 - curl},${y1 - 10}" stroke-width="${s3}" />` +
        `<path d="M${x1 - curl},${y1 - 10} C${x1 - curl - 14},${y1 - 10} ${x1 - curl - 14},${y1 - 24} ${x1 - 12},${y1 - 24}" stroke-width="${s4}" opacity="0.8" />` +
        `</g>`
      );
    }

    case 'floral-spectrum': {
      const x0 = padding;
      const y0 = padding;
      const x1 = w - padding;
      const y1 = h - padding;
      const r = 10;
      const s = Math.max(1, sw * 1.2);
      return (
        `<g>` +
        `<defs>` +
        `<linearGradient id="pb-spectrum" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0%" stop-color="#13b0ff" />` +
        `<stop offset="45%" stop-color="#6f4cff" />` +
        `<stop offset="100%" stop-color="#ff3bb6" />` +
        `</linearGradient>` +
        `</defs>` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="none" stroke="url(#pb-spectrum)" stroke-width="${s}" />` +
        `<g fill="url(#pb-spectrum)" opacity="0.9">` +
        `<path d="M${x0 + r},${y0 + 2} C${x0 + 2},${y0 + 2} ${x0 + 2},${y0 + r} ${x0 + r},${y0 + r} C${x0 + r * 1.4},${y0 + r} ${x0 + r * 1.4},${y0 + 2} ${x0 + r},${y0 + 2} Z" />` +
        `<path d="M${x1 - r},${y0 + 2} C${x1 - 2},${y0 + 2} ${x1 - 2},${y0 + r} ${x1 - r},${y0 + r} C${x1 - r * 1.4},${y0 + r} ${x1 - r * 1.4},${y0 + 2} ${x1 - r},${y0 + 2} Z" />` +
        `<path d="M${x0 + r},${y1 - 2} C${x0 + 2},${y1 - 2} ${x0 + 2},${y1 - r} ${x0 + r},${y1 - r} C${x0 + r * 1.4},${y1 - r} ${x0 + r * 1.4},${y1 - 2} ${x0 + r},${y1 - 2} Z" />` +
        `<path d="M${x1 - r},${y1 - 2} C${x1 - 2},${y1 - 2} ${x1 - 2},${y1 - r} ${x1 - r},${y1 - r} C${x1 - r * 1.4},${y1 - r} ${x1 - r * 1.4},${y1 - 2} ${x1 - r},${y1 - 2} Z" />` +
        `</g>` +
        `</g>`
      );
    }

    case 'vintage-banner': {
      const x0 = padding;
      const y0 = padding;
      const x1 = w - padding;
      const y1 = h - padding;
      const bannerW = Math.min(240, (x1 - x0) * 0.45);
      const bannerX = (w - bannerW) / 2;
      const bannerY = y0 + 22;
      const s = Math.max(1, sw);
      const s0 = Math.max(1, sw * 0.9);
      const leavesLeft = Array.from({ length: 10 }, (_, i) => {
        const cx = x0 + 26 + (i % 2) * 10;
        const cy = y0 + 90 + i * 28;
        return `<circle cx="${cx}" cy="${cy}" r="2" fill="${color}" opacity="0.45" />`;
      }).join('');
      const leavesRight = Array.from({ length: 10 }, (_, i) => {
        const cx = x1 - 26 - (i % 2) * 10;
        const cy = y0 + 90 + i * 28;
        return `<circle cx="${cx}" cy="${cy}" r="2" fill="${color}" opacity="0.45" />`;
      }).join('');
      return (
        `<g fill="none" stroke="${color}">` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" stroke-width="${s0}" opacity="0.65" />` +
        `<path d="M${x0 + 18},${y0 + 70} C${x0 + 36},${y0 + 120} ${x0 + 20},${y0 + 160} ${x0 + 36},${y0 + 220} C${x0 + 48},${y0 + 270} ${x0 + 26},${y0 + 310} ${x0 + 44},${y0 + 360}" stroke-width="${s}" opacity="0.9" />` +
        `<path d="M${x1 - 18},${y0 + 70} C${x1 - 36},${y0 + 120} ${x1 - 20},${y0 + 160} ${x1 - 36},${y0 + 220} C${x1 - 48},${y0 + 270} ${x1 - 26},${y0 + 310} ${x1 - 44},${y0 + 360}" stroke-width="${s}" opacity="0.9" />` +
        leavesLeft +
        leavesRight +
        `<path d="M${bannerX},${bannerY + 12} Q${bannerX + bannerW / 2},${bannerY - 10} ${bannerX + bannerW},${bannerY + 12} L${bannerX + bannerW - 18},${bannerY + 28} Q${bannerX + bannerW / 2},${bannerY + 44} ${bannerX + 18},${bannerY + 28} Z" stroke-width="${s}" fill="rgba(255,255,255,0)" />` +
        `</g>`
      );
    }

    case 'gold-frame': {
      const x0 = padding;
      const y0 = padding;
      const x1 = w - padding;
      const y1 = h - padding;
      const inset = 10;
      const sOuter = Math.max(2, sw * 2);
      const sInner = Math.max(1, sw);
      return (
        `<g>` +
        `<defs>` +
        `<linearGradient id="pb-gold" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="#8a6f1c" />` +
        `<stop offset="35%" stop-color="#f4d77a" />` +
        `<stop offset="60%" stop-color="#caa13a" />` +
        `<stop offset="100%" stop-color="#8a6f1c" />` +
        `</linearGradient>` +
        `</defs>` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="2" fill="none" stroke="url(#pb-gold)" stroke-width="${sOuter}" />` +
        `<rect x="${x0 + inset}" y="${y0 + inset}" width="${x1 - x0 - inset * 2}" height="${y1 - y0 - inset * 2}" rx="2" fill="none" stroke="url(#pb-gold)" stroke-width="${sInner}" opacity="0.9" />` +
        `<g stroke="url(#pb-gold)" stroke-width="${sInner}" opacity="0.9">` +
        `<path d="M${x0 + 10},${y0 + 30} L${x0 + 30},${y0 + 10}" />` +
        `<path d="M${x1 - 10},${y0 + 30} L${x1 - 30},${y0 + 10}" />` +
        `<path d="M${x0 + 10},${y1 - 30} L${x0 + 30},${y1 - 10}" />` +
        `<path d="M${x1 - 10},${y1 - 30} L${x1 - 30},${y1 - 10}" />` +
        `</g>` +
        `</g>`
      );
    }

    case 'doodle': {
      const x0 = padding;
      const y0 = padding;
      const x1 = w - padding;
      const y1 = h - padding;
      const s = Math.max(1, sw * 0.9);
      return (
        `<g fill="none" stroke="${color}" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">` +
        `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" stroke-dasharray="6 4" />` +
        `<path d="M${x0 + 40},${y0 + 18} l4,8 l-8,-4 l8,-4 l-8,4 z" />` +
        `<path d="M${x1 - 60},${y0 + 22} q12,-10 24,0 q-12,10 -24,0 z" />` +
        `<path d="M${x0 + 24},${y1 - 24} q10,-14 20,0 q-10,14 -20,0 z" />` +
        `<path d="M${x1 - 52},${y1 - 18} l10,0 m-5,-5 l5,5 l-5,5" />` +
        `<path d="M${x0 + 18},${y0 + 40} l2,6 l6,2 l-6,2 l-2,6 l-2,-6 l-6,-2 l6,-2 z" />` +
        `<path d="M${x1 - 18},${y1 - 44} l2,6 l6,2 l-6,2 l-2,6 l-2,-6 l-6,-2 l6,-2 z" />` +
        `</g>`
      );
    }

    case 'wave': {
      const band = Math.max(38, Math.min(80, h * 0.12));
      const s = Math.max(1, sw * 0.8);
      return (
        `<g>` +
        `<defs>` +
        `<linearGradient id="pb-wave" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="#0b1a3a" />` +
        `<stop offset="50%" stop-color="#2d4a86" />` +
        `<stop offset="100%" stop-color="#0b1a3a" />` +
        `</linearGradient>` +
        `</defs>` +
        `<path d="M 0 ${band} C ${w * 0.22} ${band - 18}, ${w * 0.44} ${band + 18}, ${w * 0.66} ${band} C ${w * 0.82} ${band - 14}, ${w * 0.92} ${band + 14}, ${w} ${band} L ${w} 0 L 0 0 Z" fill="url(#pb-wave)" opacity="0.92" />` +
        `<path d="M 0 ${h - band} C ${w * 0.22} ${h - band + 18}, ${w * 0.44} ${h - band - 18}, ${w * 0.66} ${h - band} C ${w * 0.82} ${h - band + 14}, ${w * 0.92} ${h - band - 14}, ${w} ${h - band} L ${w} ${h} L 0 ${h} Z" fill="url(#pb-wave)" opacity="0.92" />` +
        `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" rx="3" fill="none" stroke="${color}" opacity="0.25" stroke-width="${s}" />` +
        `</g>`
      );
    }

    default:
      return `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw}" />`;
  }
}

async function drawPageBorderOnThumbnail(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  border: PageBorderObj;
  pageRotation: 0 | 90 | 180 | 270;
  viewportW: number;
  viewportH: number;
}) {
  const { ctx, canvas, border } = params;
  const style = border.style as BorderStyle;
  const color = String(border.color ?? '#2c3e50');
  const strokeWidth = Number.isFinite(border.strokeWidth as any) ? Number(border.strokeWidth) : 2;

  const vbW = params.pageRotation === 90 || params.pageRotation === 270 ? params.viewportH : params.viewportW;
  const vbH = params.pageRotation === 90 || params.pageRotation === 270 ? params.viewportW : params.viewportH;

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="0 0 ${vbW} ${vbH}">` +
    borderToSvgMarkup({ style, color, strokeWidth, pageW: vbW, pageH: vbH }) +
    `</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawPageBackgroundOnThumbnail(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  bg: PageBackgroundObj;
}) {
  const { ctx, canvas, bg } = params;
  const src = String(bg.src ?? '');
  if (!src) return;
  const opacity = bg.opacity == null ? 1 : Math.max(0, Math.min(1, Number(bg.opacity)));

  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const rawLines = String(text ?? '').replaceAll('\r\n', '\n').split('\n');
  const out: string[] = [];
  for (const raw of rawLines) {
    if (raw.trim().length === 0) {
      out.push('');
      continue;
    }
    const words = raw.split(/\s+/g);
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      const width = ctx.measureText(candidate).width;
      if (width <= maxWidth || !current) {
        current = candidate;
      } else {
        out.push(current);
        current = w;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

export async function renderThumbnailDataUrl(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidthPx = 140,
): Promise<string> {
  const canvas = document.createElement('canvas');

  // Render at a temporary scale and let the canvas styling handle presentation.
  // For better fidelity, we choose a scale so the output is close to target width.
  const page = await doc.getPage(pageIndex + 1);
  const viewport1 = page.getViewport({ scale: 1, rotation: 0 });
  const scale = Math.max(0.1, targetWidthPx / viewport1.width);

  // Thumbnails are small; forcing DPR=1 avoids expensive retina rasterization.
  await renderPageToCanvas(doc, pageIndex, scale, canvas, 0, 1);

  // Override CSS size to keep list consistent
  canvas.style.width = `${targetWidthPx}px`;
  const ratio = canvas.height / canvas.width;
  canvas.style.height = `${targetWidthPx * ratio}px`;

  return canvas.toDataURL('image/png');
}

export async function renderEditorThumbnailDataUrl(params: {
  pdf: PDFDocumentProxy;
  originalPageIndex: number;
  pageRotation: 0 | 90 | 180 | 270;
  overlayObjects: OverlayObject[];
  targetWidthPx?: number;
}): Promise<string> {
  const targetWidthPx = params.targetWidthPx ?? 140;
  const canvas = document.createElement('canvas');

  const page = await params.pdf.getPage(params.originalPageIndex + 1);
  const viewport1 = page.getViewport({ scale: 1, rotation: 0 });
  const scale = Math.max(0.1, targetWidthPx / viewport1.width);

  // Thumbnails are small; forcing DPR=1 avoids expensive retina rasterization.
  await renderPageToCanvas(params.pdf, params.originalPageIndex, scale, canvas, params.pageRotation, 1);

  const ctx = canvas.getContext('2d');
  if (ctx && params.overlayObjects.length > 0) {
    const rotFwd = (x: number, y: number) => {
      switch (params.pageRotation) {
        case 0:
          return { x, y };
        case 90:
          return { x: viewport1.height - y, y: x };
        case 180:
          return { x: viewport1.width - x, y: viewport1.height - y };
        case 270:
          return { x: y, y: viewport1.width - x };
        default:
          return { x, y };
      }
    };

    const rectToView = (r: { x: number; y: number; w: number; h: number }) => {
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

    const bg = params.overlayObjects.find((o) => o.type === 'pageBackground') as PageBackgroundObj | undefined;
    const border = params.overlayObjects.find((o) => o.type === 'pageBorder') as PageBorderObj | undefined;
    const highlights = params.overlayObjects.filter((o) => o.type === 'highlight') as HighlightObj[];
    const inks = params.overlayObjects.filter((o) => o.type === 'ink') as InkObj[];
    const images = params.overlayObjects.filter((o) => o.type === 'image') as ImageObj[];
    const texts = params.overlayObjects.filter((o) => o.type === 'text') as TextObj[];
    const lists = params.overlayObjects.filter((o) => o.type === 'list') as ListObj[];

    // page background (behind everything)
    if (bg) {
      try {
        await drawPageBackgroundOnThumbnail({ ctx, canvas, bg });
      } catch {
        // ignore
      }
    }

    // page border (behind other overlays)
    if (border) {
      try {
        await drawPageBorderOnThumbnail({
          ctx,
          canvas,
          border,
          pageRotation: params.pageRotation,
          viewportW: viewport1.width,
          viewportH: viewport1.height,
        });
      } catch {
        // ignore
      }
    }

    // highlight (under)
    for (const h of highlights) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(h.opacity ?? 0.35)));
      ctx.fillStyle = h.color;
      const vr = rectToView(h.rect);
      ctx.fillRect(vr.x * scale, vr.y * scale, vr.w * scale, vr.h * scale);
      ctx.restore();
    }

    // ink (under)
    for (const ink of inks) {
      if (!ink.points || ink.points.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(ink.opacity ?? 1)));
      ctx.strokeStyle = ink.color;
      ctx.lineWidth = Math.max(0.5, Number(ink.width ?? 2) * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const p0 = rotFwd(ink.points[0].x, ink.points[0].y);
      ctx.moveTo(p0.x * scale, p0.y * scale);
      for (let i = 1; i < ink.points.length; i++) {
        const pi = rotFwd(ink.points[i].x, ink.points[i].y);
        ctx.lineTo(pi.x * scale, pi.y * scale);
      }
      ctx.stroke();
      ctx.restore();
    }

    // images
    for (const img of images) {
      const src = String(img.src ?? '');
      if (!src.startsWith('data:')) continue;
      try {
        const el = new Image();
        el.decoding = 'async';
        el.src = src;
        await el.decode();

        const vr = rectToView(img.rect);
        const bw = Math.max(1, vr.w * scale);
        const bh = Math.max(1, vr.h * scale);

        ctx.save();
        ctx.translate(vr.x * scale, vr.y * scale);
        ctx.globalAlpha = img.opacity == null ? 1 : Math.max(0, Math.min(1, Number(img.opacity)));

        // Clip borderRadius -> crop -> mask (same order as export/editor)
        const borderRadius = Math.max(0, Number(img.borderRadius ?? 0)) * scale;
        ctx.beginPath();
        if (borderRadius > 0) {
          const rr = Math.min(borderRadius, bw / 2, bh / 2);
          ctx.moveTo(rr, 0);
          ctx.lineTo(bw - rr, 0);
          ctx.quadraticCurveTo(bw, 0, bw, rr);
          ctx.lineTo(bw, bh - rr);
          ctx.quadraticCurveTo(bw, bh, bw - rr, bh);
          ctx.lineTo(rr, bh);
          ctx.quadraticCurveTo(0, bh, 0, bh - rr);
          ctx.lineTo(0, rr);
          ctx.quadraticCurveTo(0, 0, rr, 0);
        } else {
          ctx.rect(0, 0, bw, bh);
        }
        ctx.clip();

        const crop = img.crop ?? { l: 0, t: 0, r: 0, b: 0 };
        const cx = Math.max(0, Math.min(1, Number(crop.l) || 0)) * bw;
        const cy = Math.max(0, Math.min(1, Number(crop.t) || 0)) * bh;
        const cw = Math.max(0, (1 - (Number(crop.l) || 0) - (Number(crop.r) || 0)) * bw);
        const ch = Math.max(0, (1 - (Number(crop.t) || 0) - (Number(crop.b) || 0)) * bh);
        ctx.beginPath();
        ctx.rect(cx, cy, cw, ch);
        ctx.clip();

        const mask = img.mask ?? ({ type: 'none' } as any);
        if (mask.type !== 'none') {
          try {
            const d = getCachedMaskPathD(img.id, mask as any, Math.round(bw), Math.round(bh));
            if (d) {
              const p = new Path2D(d);
              ctx.beginPath();
              ctx.clip(p);
            }
          } catch {
            // ignore
          }
        }

        // filters
        const f = img.filters ?? {};
        const brightness = f.brightness ?? 1;
        const contrast = f.contrast ?? img.contrast ?? 1;
        const saturation = f.saturation ?? 1;
        const grayscale = f.grayscale ?? 0;
        const sepia = f.sepia ?? 0;
        const invert = f.invert ?? 0;
        try {
          ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) sepia(${sepia}) invert(${invert})`;
        } catch {
          // ignore
        }

        // transforms
        const t = img.transform ?? {};
        const flipX = Boolean(t.flipX);
        const flipY = Boolean(t.flipY);
        const skewX = Number.isFinite(t.skewX as any) ? Number(t.skewX) : 0;
        const skewY = Number.isFinite(t.skewY as any) ? Number(t.skewY) : 0;
        if (flipX || flipY || skewX || skewY) {
          const cx0 = bw / 2;
          const cy0 = bh / 2;
          ctx.translate(cx0, cy0);
          if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
          ctx.translate(-cx0, -cy0);
          if (skewX) ctx.transform(1, 0, Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
          if (skewY) ctx.transform(1, Math.tan((skewY * Math.PI) / 180), 0, 1, 0, 0);
        }

        // contain fit (xMidYMid meet)
        const s0 = Math.min(bw / el.naturalWidth, bh / el.naturalHeight);
        const dw = el.naturalWidth * s0;
        const dh = el.naturalHeight * s0;
        const dx = (bw - dw) / 2;
        const dy = (bh - dh) / 2;
        ctx.drawImage(el, dx, dy, dw, dh);

        ctx.restore();
      } catch {
        // ignore
      }
    }

    // text (top)
    for (const t of texts) {
      const text = String(t.text ?? '').trim();
      if (!text) continue;
      const fontSize = Math.max(6, Math.min(96, Number(t.font?.size ?? t.fontSize ?? 16))) * scale;
      const lineHeight = Math.max(1.0, Math.min(3.0, Number(t.lineHeight ?? 1.3)));
      const padding = 8 * scale;

      const fontFamily = t.font?.family ?? 'Helvetica';
      const fontWeight = t.font?.bold ? '700' : '400';
      const fontStyle = t.font?.italic ? 'italic' : 'normal';
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = t.color ?? '#111111';
      ctx.textBaseline = 'alphabetic';

      const vr = rectToView(t.rect);
      const x0 = (vr.x * scale) + padding;
      const y0 = (vr.y * scale) + padding;
      const w = Math.max(0, (vr.w * scale) - padding * 2);
      const h = Math.max(0, (vr.h * scale) - padding * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(vr.x * scale, vr.y * scale, vr.w * scale, vr.h * scale);
      ctx.clip();

      const lines = wrapCanvasLines(ctx, text, w);
      const maxLines = h > 0 ? Math.max(1, Math.floor(h / (fontSize * lineHeight))) : lines.length;
      const drawLines = lines.slice(0, maxLines);

      for (let i = 0; i < drawLines.length; i++) {
        const line = drawLines[i];
        const lineW = ctx.measureText(line).width;
        const align = (t.align ?? 'left');
        const extraX =
          align === 'center'
            ? Math.max(0, (w - lineW) / 2)
            : align === 'right'
              ? Math.max(0, w - lineW)
              : 0;

        const y = y0 + (i + 1) * fontSize * lineHeight;
        ctx.fillText(line, x0 + extraX, y);
      }

      ctx.restore();
    }

    // lists (top)
    for (const lst of lists) {
      const items = (lst.items ?? []).filter((it) => String(it.text ?? '').trim().length > 0);
      if (items.length === 0) continue;

      const fontSize = Math.max(6, Math.min(96, Number(lst.font?.size ?? lst.fontSize ?? 16))) * scale;
      const lineHeight = Math.max(1.0, Math.min(3.0, Number(lst.lineHeight ?? 1.3)));
      const padding = 8 * scale;

      const fontFamily = lst.font?.family ?? 'Helvetica';
      const fontWeight = lst.font?.bold ? '700' : '400';
      const fontStyle = lst.font?.italic ? 'italic' : 'normal';
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = lst.color ?? '#111111';
      ctx.textBaseline = 'alphabetic';

      const vr = rectToView(lst.rect);
      const x0 = (vr.x * scale) + padding;
      const y0 = (vr.y * scale) + padding;
      const w = Math.max(0, (vr.w * scale) - padding * 2);
      const h = Math.max(0, (vr.h * scale) - padding * 2);
      const maxLines = h > 0 ? Math.max(1, Math.floor(h / (fontSize * lineHeight))) : 9999;

      const listType = (lst.listType ?? 'bullet') as any;
      const startNumber = Math.max(1, Number(lst.startNumber ?? 1) || 1);
      const indentSize = Math.max(0, Number(lst.indentSize ?? 18) || 18) * scale;
      const gap = 6 * scale;
      const align = (lst.align ?? 'left') as 'left' | 'center' | 'right';

      const markerFor = (idx: number, checked?: boolean) => {
        return formatListMarker({ listType, index: idx, startNumber, checked, mode: 'thumbnail' });
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(vr.x * scale, vr.y * scale, vr.w * scale, vr.h * scale);
      ctx.clip();

      let globalLine = 0;
      for (let i = 0; i < items.length; i++) {
        if (globalLine >= maxLines) break;

        const it = items[i];
        const indentPx = Math.max(0, Number(it.indentLevel ?? 0) || 0) * indentSize;
        const marker = markerFor(i, it.checked);
        const markerW = ctx.measureText(marker).width;
        const available = Math.max(0, w - indentPx - markerW - gap);

        const lines = wrapCanvasLines(ctx, String(it.text ?? ''), available);

        for (let li = 0; li < lines.length; li++) {
          if (globalLine >= maxLines) break;

          const line = lines[li];
          const lineW = ctx.measureText(line).width;
          const extraX =
            align === 'center'
              ? Math.max(0, (available - lineW) / 2)
              : align === 'right'
                ? Math.max(0, available - lineW)
                : 0;

          const y = y0 + (globalLine + 1) * fontSize * lineHeight;
          const baseX = x0 + indentPx;
          if (li === 0) ctx.fillText(marker, baseX, y);
          ctx.fillText(line, baseX + markerW + gap + extraX, y);
          globalLine++;
        }
      }

      ctx.restore();
    }
  }

  canvas.style.width = `${targetWidthPx}px`;
  const ratio = canvas.height / canvas.width;
  canvas.style.height = `${targetWidthPx * ratio}px`;
  return canvas.toDataURL('image/png');
}

export type ThumbnailQuality = 'low' | 'high';

const editorThumbCache = new Map<string, Promise<string>>();

export function clearEditorThumbnailCache() {
  editorThumbCache.clear();
}

export async function getEditorThumbnailDataUrlCached(params: {
  pdf: PDFDocumentProxy;
  cacheKey: string;
  originalPageIndex: number;
  pageRotation: 0 | 90 | 180 | 270;
  overlayObjects: OverlayObject[];
  quality: ThumbnailQuality;
}): Promise<string> {
  const key = `${params.cacheKey}:${params.quality}`;
  const cached = editorThumbCache.get(key);
  if (cached) return await cached;

  const targetWidthPx = params.quality === 'high' ? 220 : 110;
  const p = renderEditorThumbnailDataUrl({
    pdf: params.pdf,
    originalPageIndex: params.originalPageIndex,
    pageRotation: params.pageRotation,
    overlayObjects: params.overlayObjects,
    targetWidthPx,
  });

  editorThumbCache.set(key, p);
  try {
    return await p;
  } catch (e) {
    editorThumbCache.delete(key);
    throw e;
  }
}
