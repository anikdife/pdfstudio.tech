import { rgb, degrees, StandardFonts, type PDFDocument, type PDFPage } from 'pdf-lib';
import type { PageRotation } from '../state/types';
import type { PageCrop } from './crop';
import { cropToPdfLibCropBox, clampCrop, viewSizeForRotation } from './crop';

export type PageNumbersPosition = 'bottom-center' | 'bottom-left' | 'bottom-right';

export type PageNumbersSettings = {
  enabled: boolean;
  position: PageNumbersPosition;
  fontSize: number;
  color: string; // hex
  format: string; // "Page {page} of {total}"
};

export type WatermarkSettings = {
  enabled: boolean;
  text: string;
  opacity: number; // 0..1
  rotation: number; // degrees
  fontSize: number;
  color: string; // hex
  placement: 'center';
};

export type ExportStampSettings = {
  pageNumbers: PageNumbersSettings;
  watermark: WatermarkSettings;
};

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

export function computeStampPosition(
  pageW: number,
  pageH: number,
  crop: PageCrop | null | undefined,
  position: PageNumbersPosition,
  padding = 18,
): { x: number; y: number } {
  const c = crop ? clampCrop(crop, pageW, pageH) : null;
  const left = c ? c.left : 0;
  const right = c ? c.right : pageW;
  const top = c ? c.top : 0;
  const bottom = c ? c.bottom : pageH;

  const xCenter = left + (right - left) / 2;
  const yBottom = bottom;

  if (position === 'bottom-left') return { x: left + padding, y: yBottom - padding };
  if (position === 'bottom-right') return { x: right - padding, y: yBottom - padding };
  return { x: xCenter, y: yBottom - padding };
}

function viewToPdfPoint(pageH: number, viewX: number, viewY: number): { x: number; y: number } {
  // Stamps are positioned in unrotated top-left coordinates.
  // Export sets PDF /Rotate on the page, so we draw in unrotated PDF space.
  return { x: viewX, y: pageH - viewY };
}

export async function applyPageNumbersAndWatermark(params: {
  pdf: PDFDocument;
  outPage: PDFPage;
  pageIndex: number; // 0-based in export order
  total: number;
  pageW: number;
  pageH: number;
  rotation: PageRotation;
  crop: PageCrop | null | undefined;
  settings: ExportStampSettings;
}) {
  const { settings } = params;
  if (!settings.pageNumbers.enabled && !settings.watermark.enabled) return;

  const font = await params.pdf.embedFont(StandardFonts.Helvetica);

  // Page numbers
  if (settings.pageNumbers.enabled) {
    const format = settings.pageNumbers.format || 'Page {page} of {total}';
    const text = format
      .replaceAll('{page}', String(params.pageIndex + 1))
      .replaceAll('{total}', String(params.total));

    const pos = computeStampPosition(params.pageW, params.pageH, params.crop, settings.pageNumbers.position, 18);

    const draw = viewToPdfPoint(params.pageH, pos.x, pos.y);

    const color = hexToRgb01(settings.pageNumbers.color);

    const size = Math.max(6, Math.min(48, Number(settings.pageNumbers.fontSize) || 12));

    // Align: approximate by shifting x for center/right
    const width = font.widthOfTextAtSize(text, size);
    let x = draw.x;
    if (settings.pageNumbers.position === 'bottom-center') x = draw.x - width / 2;
    if (settings.pageNumbers.position === 'bottom-right') x = draw.x - width;

    if (params.rotation === 180) {
      params.outPage.drawText(text, {
        x: x + width,
        y: draw.y + size,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        rotate: degrees(180),
      });
    } else {
      params.outPage.drawText(text, {
        x,
        y: draw.y,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
      });
    }
  }

  // Watermark
  if (settings.watermark.enabled && settings.watermark.text.trim().length > 0) {
    const text = settings.watermark.text;
    const size = Math.max(10, Math.min(200, Number(settings.watermark.fontSize) || 48));
    const opacity = Math.max(0, Math.min(1, Number(settings.watermark.opacity) || 0.15));
    const rot = Number(settings.watermark.rotation);
    const color = hexToRgb01(settings.watermark.color);

    // Place at center of crop (unrotated top-left coords)
    const c = params.crop ? clampCrop(params.crop, params.pageW, params.pageH) : null;
    const cx = c ? c.left + (c.right - c.left) / 2 : params.pageW / 2;
    const cy = c ? c.top + (c.bottom - c.top) / 2 : params.pageH / 2;

    const draw = viewToPdfPoint(params.pageH, cx, cy);

    // Center text by width/height approximation
    const w = font.widthOfTextAtSize(text, size);
    const baseX = draw.x - w / 2;
    const baseY = draw.y;

    if (params.rotation === 180) {
      params.outPage.drawText(text, {
        x: baseX + w,
        y: baseY + size,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(rot + 180),
      });
    } else {
      params.outPage.drawText(text, {
        x: baseX,
        y: baseY,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(rot),
      });
    }
  }
}

export function applyCropBoxToPdfPage(params: {
  page: PDFPage;
  pageW: number;
  pageH: number;
  crop: PageCrop | null | undefined;
}) {
  if (!params.crop) return;
  const box = cropToPdfLibCropBox(params.crop, params.pageW, params.pageH);
  // pdf-lib accepts crop boxes; keep it non-destructive and reliable
  params.page.setCropBox(box.x, box.y, box.w, box.h);
}

export function defaultExportStampSettings(): ExportStampSettings {
  return {
    pageNumbers: {
      enabled: false,
      position: 'bottom-center',
      fontSize: 12,
      color: '#111111',
      format: 'Page {page} of {total}',
    },
    watermark: {
      enabled: false,
      text: '',
      opacity: 0.15,
      rotation: 45,
      fontSize: 48,
      color: '#999999',
      placement: 'center',
    },
  };
}
