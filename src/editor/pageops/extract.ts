import {
  PDFDocument,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PdfDocModel } from '../state/types';
import type { LinkMark, OverlayObject, TextObj, ImageObj, ListObj, ListType, ShapeObj, PageBorderObj, BorderStyle, PageBackgroundObj } from '../state/types';
import type { PageCrop } from './crop';
import { applyCropBoxToPdfPage, applyPageNumbersAndWatermark, type ExportStampSettings } from './stamping';
import { getCachedMaskPathD } from '../util/masks';
import { formatListMarker } from '../util/listMarkers';
import { computePolygonPoints, computeStarPoints, pointsToSvg } from '../util/shapeMath';

type TextAlign = 'left' | 'center' | 'right';

type ExportFontKey = StandardFonts | 'nikosh';

type StandardFontFamilyBase = 'helvetica' | 'times' | 'courier';

let nikoshBytesPromise: Promise<Uint8Array> | null = null;

async function loadNikoshFontBytes(): Promise<Uint8Array> {
  if (nikoshBytesPromise) return await nikoshBytesPromise;

  nikoshBytesPromise = (async () => {
    // Served by Vite from `public/fonts/Nikosh 400.ttf`
    const res = await fetch('/fonts/Nikosh%20400.ttf');
    if (!res.ok) {
      throw new Error(
        `Failed to load Nikosh font from /fonts/Nikosh%20400.ttf (HTTP ${res.status}). Make sure public/fonts/Nikosh 400.ttf exists.`,
      );
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  })();

  return await nikoshBytesPromise;
}

function normalizePrimaryFontName(family: string | null | undefined): string {
  const raw = String(family ?? '').trim();
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]+/, '').replace(/['"]+$/, '').trim().toLowerCase();
}

function pickStandardFontBaseForFamily(family: string | null | undefined): StandardFontFamilyBase {
  const n = normalizePrimaryFontName(family);
  if (!n) return 'helvetica';

  // Serif-like
  if (
    n === 'times' ||
    n === 'times new roman' ||
    n === 'libre baskerville' ||
    n === 'playfair display' ||
    n === 'serif'
  ) {
    return 'times';
  }

  // Mono-like
  if (n === 'courier' || n === 'courier new' || n === 'courier prime' || n === 'fira code' || n === 'monospace') {
    return 'courier';
  }

  // Default to Helvetica-ish
  return 'helvetica';
}

function pickStandardFontName(params: { bold?: boolean; italic?: boolean; family?: string | null }): StandardFonts {
  const bold = Boolean(params.bold);
  const italic = Boolean(params.italic);
  const base = pickStandardFontBaseForFamily(params.family);

  if (base === 'times') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (base === 'courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function isNikoshFamily(family: string | null | undefined): boolean {
  return normalizePrimaryFontName(family) === 'nikosh';
}

async function getExportFont(params: {
  pdf: PDFDocument;
  fontCache: Map<ExportFontKey, PDFFont>;
  family?: string | null;
  bold?: boolean;
  italic?: boolean;
}): Promise<PDFFont> {
  if (isNikoshFamily(params.family)) {
    const key: ExportFontKey = 'nikosh';
    const cached = params.fontCache.get(key);
    if (cached) return cached;

    // Ensure fontkit is registered before embedding custom fonts.
    (params.pdf as any).registerFontkit(fontkit);
    const bytes = await loadNikoshFontBytes();
    const embedded = await params.pdf.embedFont(bytes, { subset: true });
    params.fontCache.set(key, embedded);
    return embedded;
  }

  const fontName = pickStandardFontName({
    family: params.family,
    bold: Boolean(params.bold),
    italic: Boolean(params.italic),
  });
  const cached = params.fontCache.get(fontName);
  if (cached) return cached;
  const embedded = await params.pdf.embedFont(fontName);
  params.fontCache.set(fontName, embedded);
  return embedded;
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const raw = String(hex || '').trim();
  const m = raw.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0.07, g: 0.07, b: 0.07 };
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function viewToPdfPoint(pageH: number, viewX: number, viewY: number): { x: number; y: number } {
  // Overlays are stored in unrotated top-left coords.
  // pdf-lib draws in unrotated bottom-left coords.
  return { x: viewX, y: pageH - viewY };
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const rawLines = String(text ?? '').replaceAll('\r\n', '\n').split('\n');
  const out: string[] = [];

  for (const raw of rawLines) {
    const line = raw;
    if (line.trim().length === 0) {
      out.push('');
      continue;
    }

    const words = line.split(/\s+/g);
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth || !current) {
        current = candidate;
        continue;
      }
      out.push(current);
      current = w;
    }
    if (current) out.push(current);
  }

  return out;
}

function dataUrlToBytes(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = String(src || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return await new Promise((resolve) => {
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        try {
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        } catch {
          resolve(null);
        }
      }, 'image/png');
    } catch {
      resolve(null);
    }
  });
}

function buildCanvasFilter(img: ImageObj): string {
  const f = img.filters ?? {};
  const brightness = f.brightness ?? 1;
  const contrast = f.contrast ?? img.contrast ?? 1;
  const saturation = f.saturation ?? 1;
  const grayscale = f.grayscale ?? 0;
  const sepia = f.sepia ?? 0;
  const invert = f.invert ?? 0;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale}) sepia(${sepia}) invert(${invert})`;
}

function clipRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr <= 0) {
    ctx.rect(0, 0, w, h);
    return;
  }
  ctx.moveTo(rr, 0);
  ctx.lineTo(w - rr, 0);
  ctx.quadraticCurveTo(w, 0, w, rr);
  ctx.lineTo(w, h - rr);
  ctx.quadraticCurveTo(w, h, w - rr, h);
  ctx.lineTo(rr, h);
  ctx.quadraticCurveTo(0, h, 0, h - rr);
  ctx.lineTo(0, rr);
  ctx.quadraticCurveTo(0, 0, rr, 0);
}

async function rasterizeImageOverlay(img: ImageObj, outW: number, outH: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  if (!img.src || !img.src.startsWith('data:')) return null;

  const imageEl = new Image();
  imageEl.decoding = 'async';
  imageEl.src = img.src;
  try {
    await imageEl.decode();
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(outW));
  canvas.height = Math.max(1, Math.floor(outH));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;

  let didApplyMaskClip = false;

  // Clip sequence matches editor: container borderRadius (overflow hidden) -> crop -> mask.
  ctx.save();
  ctx.beginPath();
  clipRoundedRect(ctx, w, h, Math.max(0, Number(img.borderRadius ?? 0)));
  ctx.clip();

  const crop = img.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const cx = Math.max(0, Math.min(1, Number(crop.l) || 0)) * w;
  const cy = Math.max(0, Math.min(1, Number(crop.t) || 0)) * h;
  const cw = Math.max(0, (1 - (Number(crop.l) || 0) - (Number(crop.r) || 0)) * w);
  const ch = Math.max(0, (1 - (Number(crop.t) || 0) - (Number(crop.b) || 0)) * h);
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();

  const mask = img.mask ?? ({ type: 'none' } as any);
  if (mask.type !== 'none') {
    try {
      const d = getCachedMaskPathD(img.id, mask as any, w, h);
      if (d) {
        const p = new Path2D(d);
        // Inflate the mask slightly to avoid a 1px halo from canvas clip antialiasing
        // showing up as a thin outline in some PDF viewers after embedding the PNG.
        // We do this by temporarily scaling the path around the center for clipping.
        const expandPx = 2;
        const sx = (w + expandPx * 2) / w;
        const sy = (h + expandPx * 2) / h;
        const prev = ctx.getTransform();
        ctx.translate(w / 2, h / 2);
        ctx.scale(sx, sy);
        ctx.translate(-w / 2, -h / 2);
        ctx.clip(p);
        ctx.setTransform(prev);

        didApplyMaskClip = true;
      }
    } catch {
      // ignore mask failures
    }
  }

  // Filters
  try {
    ctx.filter = buildCanvasFilter(img);
  } catch {
    // ignore
  }

  // Transforms (flip/skew) around box center
  const t = img.transform ?? {};
  const flipX = Boolean(t.flipX);
  const flipY = Boolean(t.flipY);
  const skewX = Number.isFinite(t.skewX as any) ? Number(t.skewX) : 0;
  const skewY = Number.isFinite(t.skewY as any) ? Number(t.skewY) : 0;

  if (flipX || flipY || skewX || skewY) {
    const cx0 = w / 2;
    const cy0 = h / 2;
    ctx.translate(cx0, cy0);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.translate(-cx0, -cy0);
    if (skewX) ctx.transform(1, 0, Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
    if (skewY) ctx.transform(1, Math.tan((skewY * Math.PI) / 180), 0, 1, 0, 0);
  }

  // Draw the image like SVG preserveAspectRatio="xMidYMid meet" (contain)
  const s = Math.min(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
  const dw = imageEl.naturalWidth * s;
  const dh = imageEl.naturalHeight * s;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  // When we clip to a mask (circle/triangle/etc) the canvas antialiasing can leave
  // a 1px transparent halo on the edge, which shows up as a thin border in the
  // exported PDF. Bleed the image slightly past the clip to cover those pixels.
  const bleed = 2;
  ctx.drawImage(imageEl, dx - bleed, dy - bleed, dw + bleed * 2, dh + bleed * 2);

  ctx.restore();

  // Edge (and some PDF renderers) can show a dark fringe around transparent PNG edges
  // due to how transparent/semi-transparent pixels are filtered. A common workaround
  // is to "matte" RGB toward the expected background color (white here) while keeping
  // alpha unchanged. This prevents the renderer from sampling dark RGB values in edge
  // pixels when downscaling.
  if (didApplyMaskClip) {
    try {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 255) continue;

        // Blend current RGB toward white proportionally to transparency.
        // newRGB = (RGB * a + 255 * (255-a)) / 255
        const inv = 255 - a;
        data[i] = Math.round((data[i] * a + 255 * inv) / 255);
        data[i + 1] = Math.round((data[i + 1] * a + 255 * inv) / 255);
        data[i + 2] = Math.round((data[i + 2] * a + 255 * inv) / 255);
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // ignore postprocess failures
    }
  }

  return await canvasToPngBytes(canvas);
}

function isVectorSafeFontFamily(family: string | null | undefined): boolean {
  const n = normalizePrimaryFontName(family);
  if (!n) return true;
  if (n === 'helvetica') return true;
  if (n === 'arial') return true;
  if (n === 'sans-serif') return true;
  if (n === 'serif') return true;
  if (n === 'times' || n === 'times new roman') return true;
  if (n === 'courier' || n === 'courier new' || n === 'monospace') return true;
  if (n === 'nikosh') return true;
  return false;
}

function wrapTextLinesCanvas(text: string, ctx: CanvasRenderingContext2D, maxWidth: number): string[] {
  const rawLines = String(text ?? '').replaceAll('\r\n', '\n').split('\n');
  const out: string[] = [];

  for (const raw of rawLines) {
    const line = raw;
    if (line.trim().length === 0) {
      out.push('');
      continue;
    }

    const words = line.split(/\s+/g);
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      const width = ctx.measureText(candidate).width;
      if (width <= maxWidth || !current) {
        current = candidate;
        continue;
      }
      out.push(current);
      current = w;
    }
    if (current) out.push(current);
  }

  return out;
}

async function tryEnsureCanvasFontLoaded(fontCss: string): Promise<void> {
  if (typeof document === 'undefined') return;
  const fonts = (document as any).fonts as FontFaceSet | undefined;
  if (!fonts) return;
  try {
    await fonts.load(fontCss);
  } catch {
    // ignore
  }
  try {
    await fonts.ready;
  } catch {
    // ignore
  }
}

async function rasterizeTextToPngBytes(params: {
  text: string;
  rectW: number;
  rectH: number;
  padding: number;
  align: TextAlign;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  colorHex: string;
  maxLines: number;
}): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;

  const w = Math.max(1, Number(params.rectW) || 1);
  const h = Math.max(1, Number(params.rectH) || 1);
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w * scale));
  canvas.height = Math.max(1, Math.floor(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const fontWeight = params.bold ? '700' : '400';
  const fontStyle = params.italic ? 'italic' : 'normal';
  const fontCss = `${fontStyle} ${fontWeight} ${params.fontSize}px ${params.fontFamily}`;
  await tryEnsureCanvasFontLoaded(fontCss);

  ctx.font = fontCss;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const color = hexToRgb01(params.colorHex);
  ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;

  const maxWidth = Math.max(0, w - params.padding * 2);
  const maxHeight = Math.max(0, h - params.padding * 2);
  const maxLinesByHeight = maxHeight > 0 ? Math.max(1, Math.floor(maxHeight / (params.fontSize * params.lineHeight))) : 9999;
  const maxLines = Math.max(1, Math.min(params.maxLines, maxLinesByHeight));

  const lines = wrapTextLinesCanvas(params.text, ctx, maxWidth).slice(0, maxLines);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineW = ctx.measureText(line).width;
    const extraX =
      params.align === 'center'
        ? Math.max(0, (maxWidth - lineW) / 2)
        : params.align === 'right'
          ? Math.max(0, maxWidth - lineW)
          : 0;
    const x = params.padding + extraX;
    const y = params.padding + (li + 1) * params.fontSize * params.lineHeight;
    ctx.fillText(line, x, y);
  }

  return await canvasToPngBytes(canvas);
}

async function rasterizeListToPngBytes(params: {
  items: Array<{ text: string; indentLevel: number; checked?: boolean }>;
  listType: ListType;
  startNumber: number;
  indentSize: number;
  rectW: number;
  rectH: number;
  padding: number;
  align: TextAlign;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  colorHex: string;
  maxLines: number;
}): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;

  const w = Math.max(1, Number(params.rectW) || 1);
  const h = Math.max(1, Number(params.rectH) || 1);
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w * scale));
  canvas.height = Math.max(1, Math.floor(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const fontWeight = params.bold ? '700' : '400';
  const fontStyle = params.italic ? 'italic' : 'normal';
  const fontCss = `${fontStyle} ${fontWeight} ${params.fontSize}px ${params.fontFamily}`;
  await tryEnsureCanvasFontLoaded(fontCss);

  ctx.font = fontCss;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const color = hexToRgb01(params.colorHex);
  ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;

  const maxWidth = Math.max(0, w - params.padding * 2);
  const maxHeight = Math.max(0, h - params.padding * 2);
  const maxLinesByHeight = maxHeight > 0 ? Math.max(1, Math.floor(maxHeight / (params.fontSize * params.lineHeight))) : 9999;
  const maxLines = Math.max(1, Math.min(params.maxLines, maxLinesByHeight));

  const gap = 6;
  let globalLine = 0;

  for (let i = 0; i < params.items.length; i++) {
    if (globalLine >= maxLines) break;
    const it = params.items[i];
    const indentLevel = Math.max(0, Number(it.indentLevel ?? 0) || 0);
    const indentPx = indentLevel * params.indentSize;

    const marker = formatListMarker({
      listType: params.listType,
      index: i,
      startNumber: params.startNumber,
      checked: it.checked,
      mode: 'export',
    });

    const markerW = ctx.measureText(marker).width;
    const available = Math.max(0, maxWidth - indentPx - markerW - gap);
    const rawText = String(it.text ?? '').trimEnd();
    const lines = wrapTextLinesCanvas(rawText, ctx, available);

    for (let li = 0; li < lines.length; li++) {
      if (globalLine >= maxLines) break;

      const line = lines[li];
      const lineW = ctx.measureText(line).width;
      const extraX =
        params.align === 'center'
          ? Math.max(0, (available - lineW) / 2)
          : params.align === 'right'
            ? Math.max(0, available - lineW)
            : 0;

      const baseX = params.padding + indentPx;
      const y = params.padding + (globalLine + 1) * params.fontSize * params.lineHeight;

      if (li === 0) {
        ctx.fillText(marker, baseX, y);
      }

      const textX = baseX + markerW + gap + extraX;
      ctx.fillText(line, textX, y);
      globalLine++;
    }
  }

  return await canvasToPngBytes(canvas);
}

async function applyTextOverlaysToPage(params: {
  pdf: PDFDocument;
  page: PDFPage;
  doc: PdfDocModel;
  editorIndex: number;
  pageW: number;
  pageH: number;
  rotation: 0 | 90 | 180 | 270;
  fontCache: Map<ExportFontKey, PDFFont>;
}) {
  const overlayObjects = params.doc.overlays[params.editorIndex]?.objects ?? [];
  const texts = overlayObjects.filter((o) => o.type === 'text') as TextObj[];
  if (texts.length === 0) return;

  for (const t of texts) {
    const text = String(t.text ?? '').trimEnd();
    if (text.trim().length === 0) continue;

    const fontSize = Math.max(6, Math.min(144, Number(t.font?.size ?? t.fontSize ?? 16)));
    const lineHeight = Math.max(1.0, Math.min(3.0, Number(t.lineHeight ?? 1.3)));
    const align = (t.align ?? 'left') as TextAlign;
    const padding = 8;

    const maxWidth = Math.max(0, Number(t.rect?.w ?? 0) - padding * 2);
    const maxHeight = Math.max(0, Number(t.rect?.h ?? 0) - padding * 2);
    const maxLines = maxHeight > 0 ? Math.max(1, Math.floor(maxHeight / (fontSize * lineHeight))) : 9999;

    const family = t.font?.family;

    // If a non-standard web font was selected (e.g. handwriting Google fonts), rasterize the text box
    // using the browser's font rendering so exported appearance matches the editor.
    if (!isVectorSafeFontFamily(family)) {
      const pngBytes = await rasterizeTextToPngBytes({
        text,
        rectW: Number(t.rect?.w ?? 0),
        rectH: Number(t.rect?.h ?? 0),
        padding,
        align,
        fontFamily: String(family || 'Helvetica'),
        fontSize,
        bold: Boolean(t.font?.bold),
        italic: Boolean(t.font?.italic),
        lineHeight,
        colorHex: t.color ?? '#111111',
        maxLines,
      });

      if (pngBytes) {
        try {
          const embedded = await params.pdf.embedPng(pngBytes);
          const rect = t.rect ?? ({ x: 0, y: 0, w: 0, h: 0 } as any);
          const box = rectToPdfBox({ rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });

          if (params.rotation === 180) {
            params.page.drawImage(embedded, {
              x: box.x + box.w,
              y: box.y + box.h,
              width: box.w,
              height: box.h,
              rotate: degrees(180),
            });
          } else {
            params.page.drawImage(embedded, {
              x: box.x,
              y: box.y,
              width: box.w,
              height: box.h,
            });
          }
          continue;
        } catch {
          // fall back to vector text
        }
      }
    }

    const font = await getExportFont({
      pdf: params.pdf,
      fontCache: params.fontCache,
      family,
      bold: Boolean(t.font?.bold),
      italic: Boolean(t.font?.italic),
    });

    const lines = wrapTextLines(text, font, fontSize, maxWidth).slice(0, maxLines);

    const color = hexToRgb01(t.color ?? '#111111');

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineW = font.widthOfTextAtSize(line, fontSize);

      const extraX =
        align === 'center'
          ? Math.max(0, (maxWidth - lineW) / 2)
          : align === 'right'
            ? Math.max(0, maxWidth - lineW)
            : 0;

      // Overlay rect coords are stored in "page" units with top-left origin (same as the UI).
      // pdf-lib drawText uses bottom-left origin, so convert.
      const viewX = Number(t.rect?.x ?? 0) + padding + extraX;
      // Approximate baseline by placing it one fontSize down from the top padding.
      const viewY = Number(t.rect?.y ?? 0) + padding + (li + 1) * fontSize * lineHeight;
      const draw = viewToPdfPoint(params.pageH, viewX, viewY);

      // If the page is rotated 180°, the viewer will rotate the page content.
      // The editor UI keeps overlay text upright, so counter-rotate the text here.
      if (params.rotation === 180) {
        params.page.drawText(line, {
          x: draw.x + lineW,
          y: draw.y + fontSize,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          rotate: degrees(180),
        });
      } else {
        params.page.drawText(line, {
          x: draw.x,
          y: draw.y,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }
    }
  }
}

async function applyListOverlaysToPage(params: {
  pdf: PDFDocument;
  page: PDFPage;
  doc: PdfDocModel;
  editorIndex: number;
  pageW: number;
  pageH: number;
  rotation: 0 | 90 | 180 | 270;
  fontCache: Map<ExportFontKey, PDFFont>;
}) {
  const overlayObjects = params.doc.overlays[params.editorIndex]?.objects ?? [];
  const lists = overlayObjects.filter((o) => o.type === 'list') as ListObj[];
  if (lists.length === 0) return;

  for (const lst of lists) {
    const items = (lst.items ?? []).filter((it) => String(it.text ?? '').trim().length > 0);
    if (items.length === 0) continue;

    const fontSize = Math.max(6, Math.min(144, Number(lst.font?.size ?? lst.fontSize ?? 16)));
    const lineHeight = Math.max(1.0, Math.min(3.0, Number(lst.lineHeight ?? 1.3)));
    const align = (lst.align ?? 'left') as TextAlign;
    const padding = 8;

    const listType = (lst.listType ?? 'bullet') as ListType;
    const startNumber = Math.max(1, Number(lst.startNumber ?? 1) || 1);
    const indentSize = Math.max(0, Number(lst.indentSize ?? 18) || 18);
    const gap = 6;
    const color = hexToRgb01(lst.color ?? '#111111');

    const maxWidth = Math.max(0, Number(lst.rect?.w ?? 0) - padding * 2);
    const maxHeight = Math.max(0, Number(lst.rect?.h ?? 0) - padding * 2);
    const maxLines = maxHeight > 0 ? Math.max(1, Math.floor(maxHeight / (fontSize * lineHeight))) : 9999;

    const family = lst.font?.family;

    if (!isVectorSafeFontFamily(family)) {
      const pngBytes = await rasterizeListToPngBytes({
        items: items.map((it) => ({ text: String(it.text ?? ''), indentLevel: Number(it.indentLevel ?? 0) || 0, checked: it.checked })),
        listType,
        startNumber,
        indentSize,
        rectW: Number(lst.rect?.w ?? 0),
        rectH: Number(lst.rect?.h ?? 0),
        padding,
        align,
        fontFamily: String(family || 'Helvetica'),
        fontSize,
        bold: Boolean(lst.font?.bold),
        italic: Boolean(lst.font?.italic),
        lineHeight,
        colorHex: lst.color ?? '#111111',
        maxLines,
      });

      if (pngBytes) {
        try {
          const embedded = await params.pdf.embedPng(pngBytes);
          const rect = lst.rect ?? ({ x: 0, y: 0, w: 0, h: 0 } as any);
          const box = rectToPdfBox({ rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });

          if (params.rotation === 180) {
            params.page.drawImage(embedded, {
              x: box.x + box.w,
              y: box.y + box.h,
              width: box.w,
              height: box.h,
              rotate: degrees(180),
            });
          } else {
            params.page.drawImage(embedded, {
              x: box.x,
              y: box.y,
              width: box.w,
              height: box.h,
            });
          }
          continue;
        } catch {
          // fall back to vector list
        }
      }
    }

    const font = await getExportFont({
      pdf: params.pdf,
      fontCache: params.fontCache,
      family,
      bold: Boolean(lst.font?.bold),
      italic: Boolean(lst.font?.italic),
    });

    let globalLine = 0;

    for (let i = 0; i < items.length; i++) {
      if (globalLine >= maxLines) break;

      const it = items[i];
      const indentLevel = Math.max(0, Number(it.indentLevel ?? 0) || 0);
      const indentPx = indentLevel * indentSize;

      const marker = formatListMarker({ listType, index: i, startNumber, checked: it.checked, mode: 'export' });

      const markerW = font.widthOfTextAtSize(marker, fontSize);
      const available = Math.max(0, maxWidth - indentPx - markerW - gap);
      const rawText = String(it.text ?? '').trimEnd();
      const lines = wrapTextLines(rawText, font, fontSize, available);

      for (let li = 0; li < lines.length; li++) {
        if (globalLine >= maxLines) break;

        const line = lines[li];
        const lineW = font.widthOfTextAtSize(line, fontSize);
        const extraX =
          align === 'center'
            ? Math.max(0, (available - lineW) / 2)
            : align === 'right'
              ? Math.max(0, available - lineW)
              : 0;

        const baseX = Number(lst.rect?.x ?? 0) + padding + indentPx;
        const viewY = Number(lst.rect?.y ?? 0) + padding + (globalLine + 1) * fontSize * lineHeight;

        // marker only on first wrapped line
        if (li === 0) {
          const mDraw = viewToPdfPoint(params.pageH, baseX, viewY);
          if (params.rotation === 180) {
            params.page.drawText(marker, {
              x: mDraw.x + markerW,
              y: mDraw.y + fontSize,
              size: fontSize,
              font,
              color: rgb(color.r, color.g, color.b),
              rotate: degrees(180),
            });
          } else {
            params.page.drawText(marker, {
              x: mDraw.x,
              y: mDraw.y,
              size: fontSize,
              font,
              color: rgb(color.r, color.g, color.b),
            });
          }
        }

        const textX = baseX + markerW + gap + extraX;
        const tDraw = viewToPdfPoint(params.pageH, textX, viewY);
        if (params.rotation === 180) {
          params.page.drawText(line, {
            x: tDraw.x + lineW,
            y: tDraw.y + fontSize,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
            rotate: degrees(180),
          });
        } else {
          params.page.drawText(line, {
            x: tDraw.x,
            y: tDraw.y,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
          });
        }

        globalLine++;
      }
    }
  }
}

function rectToPdfBox(params: {
  rect: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
  rotation: 0 | 90 | 180 | 270;
}): { x: number; y: number; w: number; h: number } {
  // Overlays are stored in unrotated top-left coords.
  // Convert rect top-left -> PDF bottom-left.
  const r = params.rect;
  return {
    x: r.x,
    y: params.pageH - (r.y + r.h),
    w: Math.max(0, r.w),
    h: Math.max(0, r.h),
  };
}

function getOrCreateAnnotsArray(pdf: PDFDocument, page: PDFPage): PDFArray {
  const ctx = (pdf as any).context;
  const node = (page as any).node;
  const key = PDFName.of('Annots');
  const existing = node.get(key) as any;
  if (existing) {
    if (existing instanceof PDFArray) return existing;
    try {
      return ctx.lookup(existing as PDFRef, PDFArray);
    } catch {
      // fall through to recreate
    }
  }

  const arr = ctx.obj([]) as PDFArray;
  node.set(key, arr);
  return arr;
}

function getPageRef(page: PDFPage): PDFRef | null {
  const anyPage = page as any;
  return (anyPage?.ref as PDFRef) ?? (anyPage?.node?.ref as PDFRef) ?? null;
}

function toPdfRectArray(ctx: any, box: { x: number; y: number; w: number; h: number }): PDFArray {
  const x1 = box.x;
  const y1 = box.y;
  const x2 = box.x + box.w;
  const y2 = box.y + box.h;
  return ctx.obj([x1, y1, x2, y2].map((n) => PDFNumber.of(Number(n)))) as PDFArray;
}

function fitSingleLineText(params: {
  text: string;
  font: PDFFont;
  maxWidth: number;
  maxFontSize: number;
  minFontSize: number;
}): { text: string; fontSize: number } {
  const raw = String(params.text ?? '');
  const maxW = Math.max(1, params.maxWidth);
  const minSize = Math.max(1, params.minFontSize);
  let fontSize = Math.max(minSize, params.maxFontSize);

  const widthAt = (t: string, s: number) => params.font.widthOfTextAtSize(t, s);
  const w0 = widthAt(raw, fontSize);
  if (w0 > maxW) {
    const scale = maxW / Math.max(1e-6, w0);
    fontSize = Math.max(minSize, Math.min(params.maxFontSize, fontSize * scale));
  }

  // If still too wide, truncate with ellipsis.
  let text = raw;
  const ell = '…';
  if (widthAt(text, fontSize) > maxW) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = text.slice(0, mid).trimEnd() + ell;
      if (widthAt(candidate, fontSize) <= maxW) lo = mid + 1;
      else hi = mid;
    }
    const cut = Math.max(0, lo - 1);
    text = cut <= 0 ? '' : text.slice(0, cut).trimEnd() + ell;
    if (text && widthAt(text, fontSize) > maxW) text = '';
  }

  return { text, fontSize };
}

async function applyLinkAnnotationsToPage(params: {
  pdf: PDFDocument;
  page: PDFPage;
  doc: PdfDocModel;
  editorIndex: number;
  pageW: number;
  pageH: number;
  rotation: 0 | 90 | 180 | 270;
  fontCache: Map<ExportFontKey, PDFFont>;
  editorIndexToOutIndex: Map<number, number>;
  editorIndexToPageH: Map<number, number>;
}): Promise<void> {
  const marks = (params.doc.linksByPage?.[params.editorIndex] ?? []) as LinkMark[];
  if (!marks || marks.length === 0) return;

  const ctx = (params.pdf as any).context;
  const annots = getOrCreateAnnotsArray(params.pdf, params.page);

  for (const m of marks) {
    const target: any = (m as any).target;
    if (!target || !m.rect) continue;

    const box = rectToPdfBox({ rect: m.rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || box.w <= 0 || box.h <= 0) continue;
    const rectArr = toPdfRectArray(ctx, box);

    const baseAnnot: any = {
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rectArr,
      Border: ctx.obj([0, 0, 0]),
    };

    if (target.kind === 'external') {
      const url = String(target.url ?? '').trim();
      if (!url) continue;

      // Optional visible label (requested behavior): show URL text unless explicitly disabled.
      if ((m as any).showLabel !== false) {
        try {
          const font = await getExportFont({ pdf: params.pdf, fontCache: params.fontCache });
          const padding = 2;
          const maxW = Math.max(1, box.w - padding * 2);
          const maxH = Math.max(1, box.h - padding * 2);
          const fitted = fitSingleLineText({
            text: url,
            font,
            maxWidth: maxW,
            maxFontSize: Math.min(12, Math.max(6, maxH)),
            minFontSize: 6,
          });
          if (fitted.text) {
            const x = box.x + padding;
            const y = box.y + box.h - fitted.fontSize - padding;
            params.page.drawText(fitted.text, {
              x,
              y,
              size: fitted.fontSize,
              font,
              color: rgb(0, 0, 1),
            });
          }
        } catch {
          // ignore (label is best-effort)
        }
      }

      const annotRef = ctx.register(
        ctx.obj({
          ...baseAnnot,
          A: ctx.obj({ S: 'URI', URI: PDFString.of(url) }),
        }),
      ) as PDFRef;
      annots.push(annotRef);
      continue;
    }

    if (target.kind === 'internal') {
      const destEditorIndex = Number(target.pageIndex);
      if (!Number.isFinite(destEditorIndex)) continue;
      const outIdx = params.editorIndexToOutIndex.get(destEditorIndex);
      if (outIdx == null) continue; // destination page not included in this export

      const destPage = params.pdf.getPages()[outIdx];
      const destRef = getPageRef(destPage);
      if (!destRef) continue;

      const destH = params.editorIndexToPageH.get(destEditorIndex) ?? (destPage.getSize()?.height ?? 0);
      const useXYZ = Number.isFinite(target.x) || Number.isFinite(target.y) || Number.isFinite(target.zoom);

      const destArray = useXYZ
        ? ctx.obj([
            destRef,
            PDFName.of('XYZ'),
            Number.isFinite(target.x) ? PDFNumber.of(Number(target.x)) : ctx.obj(null),
            Number.isFinite(target.y) ? PDFNumber.of(destH - Number(target.y)) : ctx.obj(null),
            Number.isFinite(target.zoom) ? PDFNumber.of(Number(target.zoom)) : ctx.obj(null),
          ])
        : ctx.obj([destRef, PDFName.of('Fit')]);

      const annotRef = ctx.register(
        ctx.obj({
          ...baseAnnot,
          Dest: destArray,
        }),
      ) as PDFRef;
      annots.push(annotRef);
    }
  }
}

function normalizeRightAngleRotation(angle: number): 0 | 90 | 180 | 270 {
  const a = Number.isFinite(angle) ? angle : 0;
  const snapped = Math.round(a / 90) * 90;
  const mod = (((snapped % 360) + 360) % 360) as any;
  return (mod === 90 ? 90 : mod === 180 ? 180 : mod === 270 ? 270 : 0) as any;
}

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function shapeToSvgMarkup(shape: ShapeObj, w: number, h: number): string {
  const style = shape.style ?? { fill: '#ffffff', stroke: '#111111', strokeWidth: 2, opacity: 1 };
  const fill = style.fill === 'none' ? 'none' : style.fill;
  const stroke = style.stroke;
  const strokeWidth = style.strokeWidth;
  const opacity = style.opacity;

  const cx = w / 2;
  const cy = h / 2;
  const rot = Number.isFinite(shape.rotation) ? shape.rotation : 0;
  const transform = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : '';
  const common = ` fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}"`;

  const lineLike =
    shape.shapeType === 'line' ||
    shape.shapeType === 'arrow' ||
    shape.shapeType === 'doubleArrow' ||
    shape.shapeType === 'connector' ||
    shape.shapeType === 'curvedArrow';

  if (lineLike) {
    const ax = 0;
    const ay = h / 2;
    const bx = w;
    const by = h / 2;

    const markerEnd =
      shape.shapeType === 'arrow' || shape.shapeType === 'connector' || shape.shapeType === 'curvedArrow'
        ? ' marker-end="url(#arrow)"'
        : '';
    const markerStart = shape.shapeType === 'doubleArrow' ? ' marker-start="url(#arrow)"' : '';

    if (shape.shapeType === 'curvedArrow') {
      const d = `M ${ax} ${ay} Q ${w / 2} ${-h / 2} ${bx} ${by}`;
      return `<g${transform}><path d="${d}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}"${markerEnd} /></g>`;
    }

    const line = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}"${markerEnd}${markerStart} />`;
    const caps =
      shape.shapeType === 'connector'
        ? `<circle cx="${ax}" cy="${ay}" r="${Math.max(3, strokeWidth)}" fill="${escapeXml(stroke)}" opacity="${opacity}" />` +
          `<circle cx="${bx}" cy="${by}" r="${Math.max(3, strokeWidth)}" fill="${escapeXml(stroke)}" opacity="${opacity}" />`
        : '';
    return `<g${transform}>${line}${caps}</g>`;
  }

  const type = shape.shapeType;
  if (type === 'rect') return `<g${transform}><rect x="0" y="0" width="${w}" height="${h}" rx="0" ry="0"${common} /></g>`;
  if (type === 'roundRect') {
    const rx = Math.min(18, Math.min(w, h) / 4);
    return `<g${transform}><rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}"${common} /></g>`;
  }
  if (type === 'circle') {
    const r = Math.min(w, h) / 2;
    return `<g${transform}><ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r}"${common} /></g>`;
  }
  if (type === 'ellipse') return `<g${transform}><ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}"${common} /></g>`;

  if (type === 'triangle') {
    const pts = `${w / 2},0 0,${h} ${w},${h}`;
    return `<g${transform}><polygon points="${pts}"${common} /></g>`;
  }

  if (type === 'polygon') {
    const pts = computePolygonPoints({ x: 0, y: 0, w, h, sides: 6 });
    return `<g${transform}><polygon points="${pointsToSvg(pts)}"${common} /></g>`;
  }

  if (type === 'star' || type === 'seal') {
    const pts = computeStarPoints({ x: 0, y: 0, w, h, points: 5, innerRatio: type === 'seal' ? 0.55 : 0.5 });
    return `<g${transform}><polygon points="${pointsToSvg(pts)}"${common} /></g>`;
  }

  if (type === 'process') {
    const rx = 6;
    return `<g${transform}><rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}"${common} /></g>`;
  }

  if (type === 'decision') {
    const pts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
    return `<g${transform}><polygon points="${pts}"${common} /></g>`;
  }

  if (type === 'terminator') {
    const rx = Math.min(w, h) / 2;
    return `<g${transform}><rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}"${common} /></g>`;
  }

  if (type === 'inputOutput') {
    const skew = Math.min(w * 0.18, 24);
    const pts = `${skew},0 ${w},0 ${w - skew},${h} 0,${h}`;
    return `<g${transform}><polygon points="${pts}"${common} /></g>`;
  }

  if (type === 'document') {
    const wave = Math.min(16, h * 0.2);
    const d = [
      `M 0 0`,
      `L ${w} 0`,
      `L ${w} ${h - wave}`,
      `C ${w * 0.75} ${h} ${w * 0.25} ${h - 2 * wave} 0 ${h - wave}`,
      `Z`,
    ].join(' ');
    return `<g${transform}><path d="${d}"${common} /></g>`;
  }

  if (type === 'database') {
    const r = Math.min(18, h * 0.25);
    const d = [
      `M 0 ${r}`,
      `C 0 0 ${w} 0 ${w} ${r}`,
      `L ${w} ${h - r}`,
      `C ${w} ${h} 0 ${h} 0 ${h - r}`,
      `Z`,
    ].join(' ');
    const topEllipse = `<ellipse cx="${w / 2}" cy="${r}" rx="${w / 2}" ry="${r}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    return `<g${transform}><path d="${d}"${common} />${topEllipse}</g>`;
  }

  if (type === 'speechBubble') {
    const tail = shape.variant ?? 'tail-down';
    const r = Math.min(14, Math.min(w, h) / 5);
    const tailSize = Math.min(18, Math.min(w, h) / 4);
    const cx0 = w / 2;
    const cy0 = h / 2;
    let tx = cx0;
    let ty = h + tailSize;
    if (tail === 'tail-up') {
      ty = -tailSize;
    } else if (tail === 'tail-left') {
      tx = -tailSize;
      ty = cy0;
    } else if (tail === 'tail-right') {
      tx = w + tailSize;
      ty = cy0;
    }
    const attach = (() => {
      if (tail === 'tail-up') return { ax: cx0 - tailSize / 2, ay: 0, bx: cx0 + tailSize / 2, by: 0 };
      if (tail === 'tail-left') return { ax: 0, ay: cy0 - tailSize / 2, bx: 0, by: cy0 + tailSize / 2 };
      if (tail === 'tail-right') return { ax: w, ay: cy0 - tailSize / 2, bx: w, by: cy0 + tailSize / 2 };
      return { ax: cx0 - tailSize / 2, ay: h, bx: cx0 + tailSize / 2, by: h };
    })();
    const d = [
      `M ${r} 0`,
      `L ${w - r} 0`,
      `Q ${w} 0 ${w} ${r}`,
      `L ${w} ${h - r}`,
      `Q ${w} ${h} ${w - r} ${h}`,
      `L ${r} ${h}`,
      `Q 0 ${h} 0 ${h - r}`,
      `L 0 ${r}`,
      `Q 0 0 ${r} 0`,
      `Z`,
      `M ${attach.ax} ${attach.ay}`,
      `L ${tx} ${ty}`,
      `L ${attach.bx} ${attach.by}`,
      `Z`,
    ].join(' ');
    return `<g${transform}><path d="${d}"${common} /></g>`;
  }

  if (type === 'labelTag') {
    const notch = Math.min(26, w * 0.22);
    const pts = `0,0 ${w - notch},0 ${w},${h / 2} ${w - notch},${h} 0,${h}`;
    return `<g${transform}><polygon points="${pts}"${common} /></g>`;
  }

  if (type === 'pointerCallout') {
    const r = Math.min(14, Math.min(w, h) / 5);
    const tailSize = Math.min(22, Math.min(w, h) / 3);
    const d = [
      `M ${r} 0`,
      `L ${w - r} 0`,
      `Q ${w} 0 ${w} ${r}`,
      `L ${w} ${h - r}`,
      `Q ${w} ${h} ${w - r} ${h}`,
      `L ${w * 0.55} ${h}`,
      `L ${w * 0.5} ${h + tailSize}`,
      `L ${w * 0.45} ${h}`,
      `L ${r} ${h}`,
      `Q 0 ${h} 0 ${h - r}`,
      `L 0 ${r}`,
      `Q 0 0 ${r} 0`,
      `Z`,
    ].join(' ');
    return `<g${transform}><path d="${d}"${common} /></g>`;
  }

  // Fallback
  return `<g${transform}><rect x="0" y="0" width="${w}" height="${h}" rx="0" ry="0"${common} /></g>`;
}

async function rasterizeShapeToPngBytes(params: {
  shape: ShapeObj;
  w: number;
  h: number;
}): Promise<Uint8Array | null> {
  try {
    const w = Math.max(1, Math.round(params.w));
    const h = Math.max(1, Math.round(params.h));

    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs>` +
      `<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">` +
      `<path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(params.shape.style?.stroke ?? '#111111')}" />` +
      `</marker>` +
      `</defs>` +
      shapeToSvgMarkup(params.shape, w, h) +
      `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return await canvasToPngBytes(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
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

  if (params.style === 'corporate') {
    return (
      `<g>` +
      `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw * 2}" />` +
      `<rect x="${padding + 5}" y="${padding + 5}" width="${w - padding * 2 - 10}" height="${h - padding * 2 - 10}" fill="none" stroke="${color}" stroke-width="${sw / 2}" />` +
      `</g>`
    );
  }

  if (params.style === 'modern-accent') {
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

  if (params.style === 'classic-frame') {
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

  if (params.style === 'minimalist') {
    return (
      `<g>` +
      `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw / 2}" stroke-dasharray="4 2" />` +
      `<circle cx="${padding}" cy="${padding}" r="3" fill="${color}" />` +
      `<circle cx="${w - padding}" cy="${padding}" r="3" fill="${color}" />` +
      `<circle cx="${padding}" cy="${h - padding}" r="3" fill="${color}" />` +
      `<circle cx="${w - padding}" cy="${h - padding}" r="3" fill="${color}" />` +
      `</g>`
    );
  }

  if (params.style === 'ornate-corners') {
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

  if (params.style === 'floral-spectrum') {
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

  if (params.style === 'vintage-banner') {
    const x0 = padding;
    const y0 = padding;
    const x1 = w - padding;
    const y1 = h - padding;
    const bannerW = Math.min(240, (x1 - x0) * 0.45);
    const bannerX = (w - bannerW) / 2;
    const bannerY = y0 + 22;
    const s = Math.max(1, sw);
    const s0 = Math.max(1, sw * 0.9);
    const leafColor = color;
    const leavesLeft = Array.from({ length: 10 }, (_, i) => {
      const cx = x0 + 26 + (i % 2) * 10;
      const cy = y0 + 90 + i * 28;
      return `<circle cx="${cx}" cy="${cy}" r="2" fill="${leafColor}" opacity="0.45" />`;
    }).join('');
    const leavesRight = Array.from({ length: 10 }, (_, i) => {
      const cx = x1 - 26 - (i % 2) * 10;
      const cy = y0 + 90 + i * 28;
      return `<circle cx="${cx}" cy="${cy}" r="2" fill="${leafColor}" opacity="0.45" />`;
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

  if (params.style === 'gold-frame') {
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

  if (params.style === 'doodle') {
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

  if (params.style === 'wave') {
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

  // Default fallback
  return `<rect x="${padding}" y="${padding}" width="${w - padding * 2}" height="${h - padding * 2}" fill="none" stroke="${color}" stroke-width="${sw}" />`;
}

async function rasterizePageBorderToPngBytes(params: {
  border: PageBorderObj;
  outW: number;
  outH: number;
  pageW: number;
  pageH: number;
}): Promise<Uint8Array | null> {
  try {
    if (typeof document === 'undefined') return null;

    const style = params.border.style as BorderStyle;
    const color = String(params.border.color ?? '#2c3e50');
    const strokeWidth = Number.isFinite(params.border.strokeWidth as any) ? Number(params.border.strokeWidth) : 2;

    const w = Math.max(1, Math.round(params.outW));
    const h = Math.max(1, Math.round(params.outH));
    const vbW = Math.max(1, Number(params.pageW) || 595);
    const vbH = Math.max(1, Number(params.pageH) || 842);

    const svg =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vbW} ${vbH}">` +
      borderToSvgMarkup({ style, color, strokeWidth, pageW: vbW, pageH: vbH }) +
      `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return await canvasToPngBytes(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

async function applyNonTextOverlaysToPage(params: {
  pdf: PDFDocument;
  page: PDFPage;
  doc: PdfDocModel;
  editorIndex: number;
  pageW: number;
  pageH: number;
  rotation: 0 | 90 | 180 | 270;
  imageCache: Map<string, PDFImage>;
}) {
  const overlays = (params.doc.overlays[params.editorIndex]?.objects ?? []) as OverlayObject[];
  if (overlays.length === 0) return;

  // Page background (draw first, behind everything)
  const bg = overlays.find((o) => o.type === 'pageBackground') as PageBackgroundObj | undefined;
  if (bg?.src) {
    const src = String(bg.src);
    const parsed = dataUrlToBytes(src);
    if (parsed) {
      const opacity = bg.opacity == null ? 1 : Math.max(0, Math.min(1, Number(bg.opacity)));
      const cacheKey = `bg:${parsed.mime}:${src.length}`;
      let embedded = params.imageCache.get(cacheKey);
      if (!embedded) {
        try {
          if (parsed.mime === 'image/png') embedded = await params.pdf.embedPng(parsed.bytes);
          else if (parsed.mime === 'image/jpeg' || parsed.mime === 'image/jpg') embedded = await params.pdf.embedJpg(parsed.bytes);
          else embedded = undefined as any;
          if (embedded) params.imageCache.set(cacheKey, embedded);
        } catch {
          embedded = undefined as any;
        }
      }

      if (embedded) {
        params.page.drawImage(embedded, {
          x: 0,
          y: 0,
          width: params.pageW,
          height: params.pageH,
          opacity,
        });
      }
    }
  }

  // Page border (draw first, behind everything else)
  const border = overlays.find((o) => o.type === 'pageBorder') as PageBorderObj | undefined;
  if (border) {
    const maxDim = 2400;
    const baseScale = 2;
    const desiredW = Math.max(1, Math.round(params.pageW * baseScale));
    const desiredH = Math.max(1, Math.round(params.pageH * baseScale));
    const s = Math.min(1, maxDim / Math.max(desiredW, desiredH));
    const outW = Math.max(1, Math.round(desiredW * s));
    const outH = Math.max(1, Math.round(desiredH * s));

    const cacheKey = `border:${border.style}:${outW}x${outH}:${String(border.color ?? '')}:${String(border.strokeWidth ?? '')}`;
    let embedded = params.imageCache.get(cacheKey);
    if (!embedded) {
      const pngBytes = await rasterizePageBorderToPngBytes({ border, outW, outH, pageW: params.pageW, pageH: params.pageH });
      if (pngBytes) {
        try {
          embedded = await params.pdf.embedPng(pngBytes);
          params.imageCache.set(cacheKey, embedded);
        } catch {
          embedded = undefined as any;
        }
      }
    }

    if (embedded) {
      params.page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: params.pageW,
        height: params.pageH,
        opacity: 1,
      });
    }
  }

  // Draw highlight + ink first (like the editor canvas layer), then images.
  for (const obj of overlays) {
    if (obj.type !== 'highlight') continue;
    const box = rectToPdfBox({ rect: obj.rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });
    const c = hexToRgb01(obj.color);
    const opacity = Math.max(0, Math.min(1, Number(obj.opacity ?? 0.35)));
    params.page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      color: rgb(c.r, c.g, c.b),
      opacity,
      borderWidth: 0,
    });
  }

  for (const obj of overlays) {
    if (obj.type !== 'ink') continue;
    const opacity = Math.max(0, Math.min(1, Number(obj.opacity ?? 1)));
    const c = hexToRgb01(obj.color);
    const thickness = Math.max(0.5, Math.min(50, Number(obj.width ?? 2)));
    const pts = obj.points ?? [];
    for (let i = 1; i < pts.length; i++) {
      const a = viewToPdfPoint(params.pageH, pts[i - 1].x, pts[i - 1].y);
      const b = viewToPdfPoint(params.pageH, pts[i].x, pts[i].y);
      params.page.drawLine({
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y },
        thickness,
        color: rgb(c.r, c.g, c.b),
        opacity,
      });
    }
  }

  for (const obj of overlays) {
    if (obj.type !== 'image') continue;
    const img = obj as ImageObj;
    const box = rectToPdfBox({ rect: img.rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });

    // Rasterize the overlay appearance (crop/mask/filters/transform) into a PNG and embed it.
    // This is browser-only, but the app is browser-only as well.
    const maxDim = 2048;
    const baseScale = 2;
    const desiredW = Math.max(1, Math.round(box.w * baseScale));
    const desiredH = Math.max(1, Math.round(box.h * baseScale));
    const s = Math.min(1, maxDim / Math.max(desiredW, desiredH));
    const outW = Math.max(1, Math.round(desiredW * s));
    const outH = Math.max(1, Math.round(desiredH * s));

    const cacheKey = `img:${img.id}:${outW}x${outH}:${JSON.stringify({
      srcLen: String(img.src ?? '').length,
      crop: img.crop,
      mask: img.mask,
      filters: img.filters,
      contrast: img.contrast,
      borderRadius: img.borderRadius,
      transform: img.transform,
    })}`;

    let embedded = params.imageCache.get(cacheKey);
    if (!embedded) {
      const rendered = await rasterizeImageOverlay(img, outW, outH);
      if (rendered) {
        try {
          embedded = await params.pdf.embedPng(rendered);
          params.imageCache.set(cacheKey, embedded);
        } catch {
          embedded = undefined as any;
        }
      }
    }

    // Fallback: embed original bytes if rasterization fails.
    if (!embedded) {
      const src = String(img.src ?? '');
      const parsed = dataUrlToBytes(src);
      if (!parsed) continue;
      const rawKey = `raw:${parsed.mime}:${src.length}`;
      embedded = params.imageCache.get(rawKey);
      if (!embedded) {
        try {
          if (parsed.mime === 'image/png') embedded = await params.pdf.embedPng(parsed.bytes);
          else if (parsed.mime === 'image/jpeg' || parsed.mime === 'image/jpg') embedded = await params.pdf.embedJpg(parsed.bytes);
          else continue;
          params.imageCache.set(rawKey, embedded);
        } catch {
          continue;
        }
      }
    }

    const opacity = img.opacity == null ? 1 : Math.max(0, Math.min(1, Number(img.opacity)));
    if (params.rotation === 180) {
      params.page.drawImage(embedded, {
        x: box.x + box.w,
        y: box.y + box.h,
        width: box.w,
        height: box.h,
        opacity,
        rotate: degrees(180),
      });
    } else {
      params.page.drawImage(embedded, {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        opacity,
      });
    }
  }

  // Shapes on top of images (but still below text/list).
  const shapes = overlays.filter((o) => o.type === 'shape') as ShapeObj[];
  if (shapes.length) {
    const ordered = [...shapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    for (const shape of ordered) {
      const rect = { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
      const box = rectToPdfBox({ rect, pageW: params.pageW, pageH: params.pageH, rotation: params.rotation });

      const maxDim = 2048;
      const baseScale = 2;
      const desiredW = Math.max(1, Math.round(box.w * baseScale));
      const desiredH = Math.max(1, Math.round(box.h * baseScale));
      const s = Math.min(1, maxDim / Math.max(desiredW, desiredH));
      const outW = Math.max(1, Math.round(desiredW * s));
      const outH = Math.max(1, Math.round(desiredH * s));

      const cacheKey = `shape:${shape.id}:${outW}x${outH}:${JSON.stringify({
        shapeType: shape.shapeType,
        variant: shape.variant,
        rotation: shape.rotation,
        style: shape.style,
      })}`;

      let embedded = params.imageCache.get(cacheKey);
      if (!embedded) {
        const pngBytes = await rasterizeShapeToPngBytes({ shape, w: outW, h: outH });
        if (!pngBytes) continue;
        try {
          embedded = await params.pdf.embedPng(pngBytes);
          params.imageCache.set(cacheKey, embedded);
        } catch {
          continue;
        }
      }

      params.page.drawImage(embedded, {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        opacity: Math.max(0, Math.min(1, Number(shape.style?.opacity ?? 1))),
      });
    }
  }
}

export async function exportPagesFromModel(params: {
  doc: PdfDocModel;
  pageIndices: number[]; // editor indices
  stampSettings: ExportStampSettings;
}): Promise<Uint8Array> {
  if (!params.doc.basePdfBytes) throw new Error('No PDF loaded');

  // pdf.js reports viewport sizes in CSS pixels where 1 PDF point maps to 96/72 CSS px.
  // pdf-lib expects PDF points. If editor metadata was derived from pdf.js viewport sizes,
  // we must convert back to points before changing page boxes, otherwise pages become ~33%
  // larger and the content appears "tiny" when viewers fit the page.
  const PDF_POINTS_PER_CSS_PX = 72 / 96;
  const CSS_PX_PER_PDF_POINT = 96 / 72;

  const base = await PDFDocument.load(params.doc.basePdfBytes);
  const out = await PDFDocument.create();

  // Cache standard fonts once per export.
  const fontCache = new Map<ExportFontKey, PDFFont>();
  const imageCache = new Map<string, PDFImage>();

  const total = params.pageIndices.length;

  const editorIndexToOutIndex = new Map<number, number>();
  const editorIndexToPageH = new Map<number, number>();
  const copiedPages: Array<{
    outPage: PDFPage;
    editorIndex: number;
    pageW: number;
    pageH: number;
    rotation: 0 | 90 | 180 | 270;
    crop: PageCrop | null;
    outIndex: number;
  }> = [];

  // Pass 1: copy pages + establish all page refs (needed for internal link destinations).
  for (let i = 0; i < params.pageIndices.length; i++) {
    const editorIndex = params.pageIndices[i];
    const originalIndex = params.doc.pageOrder[editorIndex] ?? editorIndex;

    const [copied] = await out.copyPages(base, [originalIndex]);
    out.addPage(copied);

    const sizePoints = params.doc.pageSizePoints?.[editorIndex];
    const copiedSize = copied.getSize();

    // Prefer explicit point metadata, but defensively detect/undo pdf.js viewport-unit leakage.
    let pageW = sizePoints?.widthPoints ?? copiedSize.width;
    let pageH = sizePoints?.heightPoints ?? copiedSize.height;

    if (sizePoints) {
      const rw = pageW / Math.max(1e-6, copiedSize.width);
      const rh = pageH / Math.max(1e-6, copiedSize.height);
      const eps = 0.03;
      if (Math.abs(rw - CSS_PX_PER_PDF_POINT) < eps && Math.abs(rh - CSS_PX_PER_PDF_POINT) < eps) {
        pageW = pageW * PDF_POINTS_PER_CSS_PX;
        pageH = pageH * PDF_POINTS_PER_CSS_PX;
      }
    }

    // Keep exported page dimensions consistent with editor metadata.
    // (Does not scale existing PDF content; it only changes page boxes.)
    copied.setSize(pageW, pageH);

    const baseRotation = normalizeRightAngleRotation((copied.getRotation() as any)?.angle ?? 0);
    const editorRotation = normalizeRightAngleRotation(params.doc.pageRotation[editorIndex] ?? 0);
    const rotation = normalizeRightAngleRotation(baseRotation + editorRotation);
    copied.setRotation(degrees(rotation));

    const crop = (params.doc.pageCrop?.[editorIndex] ?? null) as PageCrop | null;
    applyCropBoxToPdfPage({ page: copied, pageW, pageH, crop });

    editorIndexToOutIndex.set(editorIndex, i);
    editorIndexToPageH.set(editorIndex, pageH);
    copiedPages.push({ outPage: copied, editorIndex, pageW, pageH, rotation, crop, outIndex: i });
  }

  // Pass 2: apply overlays + link annotations + stamps.
  for (const entry of copiedPages) {
    const { outPage: copied, editorIndex, pageW, pageH, rotation, crop, outIndex } = entry;

    // Apply editor overlays so Extract/Split/Export include them.
    await applyNonTextOverlaysToPage({
      pdf: out,
      page: copied,
      doc: params.doc,
      editorIndex,
      pageW,
      pageH,
      rotation: rotation as any,
      imageCache,
    });

    // Text overlays on top.
    await applyTextOverlaysToPage({
      pdf: out,
      page: copied,
      doc: params.doc,
      editorIndex,
      pageW,
      pageH,
      rotation: rotation as any,
      fontCache,
    });

    // List overlays (text-like) on top.
    await applyListOverlaysToPage({
      pdf: out,
      page: copied,
      doc: params.doc,
      editorIndex,
      pageW,
      pageH,
      rotation: rotation as any,
      fontCache,
    });

    await applyLinkAnnotationsToPage({
      pdf: out,
      page: copied,
      doc: params.doc,
      editorIndex,
      pageW,
      pageH,
      rotation,
      fontCache,
      editorIndexToOutIndex,
      editorIndexToPageH,
    });

    await applyPageNumbersAndWatermark({
      pdf: out,
      outPage: copied,
      pageIndex: outIndex,
      total,
      pageW,
      pageH,
      rotation,
      crop,
      settings: params.stampSettings,
    });
  }

  return await out.save();
}
