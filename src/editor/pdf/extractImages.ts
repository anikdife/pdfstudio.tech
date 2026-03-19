import * as pdfjsLib from 'pdfjs-dist';

function safeFilename(input: string) {
  return String(input || 'image')
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120) || 'image';
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

async function imageDataToPngBytes(imgData: any): Promise<Uint8Array | null> {
  if (!imgData) return null;

  const width = Number(imgData.width);
  const height = Number(imgData.height);

  // Some pdf.js builds expose { bitmap: ImageBitmap } for decoded images.
  if (imgData.bitmap && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width || imgData.bitmap.width || 1));
    canvas.height = Math.max(1, Math.floor(height || imgData.bitmap.height || 1));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(imgData.bitmap, 0, 0);
      return await canvasToPngBytes(canvas);
    } catch {
      return null;
    }
  }

  const data = imgData.data;
  if (!data || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const clamped = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
  if (clamped.length < width * height * 4) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    const browserImgData = new ImageData(clamped, width, height);
    ctx.putImageData(browserImgData, 0, 0);
    return await canvasToPngBytes(canvas);
  } catch {
    return null;
  }
}

async function getPageImageData(page: any, imgName: string): Promise<any | null> {
  if (!page?.objs?.get || !imgName) return null;
  return await new Promise((resolve) => {
    try {
      page.objs.get(imgName, (imgData: any) => resolve(imgData ?? null));
    } catch {
      resolve(null);
    }
  });
}

export async function extractImagesFromPage(
  page: any,
  filenamePrefix: string,
): Promise<Array<{ filename: string; bytes: Uint8Array }>> {
  if (!page) return [];

  const ops = await page.getOperatorList();
  const OPS: any = (pdfjsLib as any).OPS;

  const imageOps = [OPS?.paintImageXObject, OPS?.paintInlineImageXObject].filter((x: any) => typeof x === 'number');

  const seen = new Map<string, number>();
  const out: Array<{ filename: string; bytes: Uint8Array }> = [];

  const fnArray: any[] = ops?.fnArray ?? [];
  const argsArray: any[] = ops?.argsArray ?? [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (!imageOps.includes(fn)) continue;

    // For paintImageXObject / paintInlineImageXObject, pdf.js commonly passes an object name as first arg.
    const imgName = (argsArray?.[i]?.[0] ?? '') as string;
    if (!imgName) continue;

    const n = (seen.get(imgName) ?? 0) + 1;
    seen.set(imgName, n);
    const outName = `${filenamePrefix}-${imgName}${n > 1 ? `-${n}` : ''}`;

    // eslint-disable-next-line no-await-in-loop
    const imgData = await getPageImageData(page, imgName);
    // eslint-disable-next-line no-await-in-loop
    const bytes = await imageDataToPngBytes(imgData);
    if (!bytes) continue;
    out.push({ filename: `${safeFilename(outName)}.png`, bytes });
  }

  return out;
}
