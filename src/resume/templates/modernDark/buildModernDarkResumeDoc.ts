import type { UseBoundStore, StoreApi } from 'zustand';
import type { OverlayObject, ShapeObj, TextObj, ImageObj, PageBackgroundObj } from '../../../editor/state/types';

type DocumentStoreShape = {
  newDoc: () => Promise<void>;
  setDocTitle: (title: string) => void;
  setPageBackground: (pageIndex: number, bg: Omit<PageBackgroundObj, 'id' | 'type'> | null) => void;
  addOverlayObject: (pageIndex: number, obj: OverlayObject) => void;
};

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildBackground(): { src: string; opacity: number } {
  // Dark textured-ish background using SVG gradients + subtle noise dots.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842">
  <defs>
    <radialGradient id="g" cx="25%" cy="20%" r="85%">
      <stop offset="0" stop-color="#151520" stop-opacity="1" />
      <stop offset="1" stop-color="#0b0b0f" stop-opacity="1" />
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.07" />
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <pattern id="noise" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.6" fill="#ffffff" opacity="0.05" />
      <circle cx="7" cy="3" r="0.5" fill="#ffffff" opacity="0.04" />
      <circle cx="4" cy="8" r="0.6" fill="#ffffff" opacity="0.03" />
    </pattern>
  </defs>
  <rect width="595" height="842" fill="url(#g)" />
  <rect width="595" height="842" fill="url(#shine)" />
  <rect width="595" height="842" fill="url(#noise)" />
</svg>`;

  return { src: svgDataUrl(svg), opacity: 1 };
}

function t(id: string, patch: Omit<TextObj, 'id' | 'type'>): TextObj {
  return { id, type: 'text', ...patch };
}

function s(id: string, patch: Omit<ShapeObj, 'id' | 'type'>): ShapeObj {
  return { id, type: 'shape', ...patch };
}

function img(id: string, patch: Omit<ImageObj, 'id' | 'type'>): ImageObj {
  return { id, type: 'image', ...patch };
}

function buildModernDarkResumeObjects(): OverlayObject[] {
  const white = 'rgba(255,255,255,0.92)';
  const muted = 'rgba(255,255,255,0.68)';
  const soft = 'rgba(255,255,255,0.52)';
  const accent = 'rgba(34,211,238,0.92)';
  const cardFill = 'rgba(255,255,255,0.06)';

  // A4-ish page in points: 595 x 842
  const leftX = 38;
  const leftW = 240;
  const rightX = 305;
  const rightW = 252;

  const objects: OverlayObject[] = [];

  // Glassy blocks
  objects.push(
    s('blk-left-top', {
      shapeType: 'roundRect',
      x: leftX,
      y: 34,
      w: leftW,
      h: 168,
      rotation: 0,
      zIndex: 1,
      style: { fill: cardFill, stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  objects.push(
    s('blk-left-mid', {
      shapeType: 'roundRect',
      x: leftX,
      y: 220,
      w: leftW,
      h: 250,
      rotation: 0,
      zIndex: 1,
      style: { fill: 'rgba(15,23,42,0.22)', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  objects.push(
    s('blk-left-bot', {
      shapeType: 'roundRect',
      x: leftX,
      y: 488,
      w: leftW,
      h: 320,
      rotation: 0,
      zIndex: 1,
      style: { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  objects.push(
    s('blk-right-top', {
      shapeType: 'roundRect',
      x: rightX,
      y: 34,
      w: rightW,
      h: 168,
      rotation: 0,
      zIndex: 1,
      style: { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  objects.push(
    s('blk-right-mid', {
      shapeType: 'roundRect',
      x: rightX,
      y: 220,
      w: rightW,
      h: 260,
      rotation: 0,
      zIndex: 1,
      style: { fill: 'rgba(15,23,42,0.22)', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  objects.push(
    s('blk-right-bot', {
      shapeType: 'roundRect',
      x: rightX,
      y: 498,
      w: rightW,
      h: 310,
      rotation: 0,
      zIndex: 1,
      style: { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, opacity: 1 },
      variant: 'md',
    }),
  );

  // Logo in a circle frame (uses existing app logo asset)
  objects.push(
    s('logo-ring', {
      shapeType: 'circle',
      x: leftX + 14,
      y: 50,
      w: 84,
      h: 84,
      rotation: 0,
      zIndex: 3,
      style: { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(34,211,238,0.55)', strokeWidth: 2, opacity: 1 },
    }),
  );

  objects.push(
    img('logo-img', {
      src: '/logo512.png',
      name: 'pdfstudio logo',
      rect: { x: leftX + 20, y: 56, w: 72, h: 72 },
      opacity: 0.95,
      mask: { type: 'circle' },
      filters: { contrast: 1.08, saturation: 1.05 },
    }),
  );

  // Name + title + contact (top-left)
  objects.push(
    t('name', {
      text: 'YOUR NAME',
      color: white,
      fontSize: 18,
      font: { family: 'Inter', size: 18, bold: true },
      lineHeight: 1.1,
      rect: { x: leftX + 110, y: 54, w: leftW - 130, h: 26 },
    }),
  );
  objects.push(
    t('role', {
      text: 'Product Designer / Developer',
      color: muted,
      fontSize: 11,
      font: { family: 'Inter', size: 11 },
      lineHeight: 1.2,
      rect: { x: leftX + 110, y: 80, w: leftW - 130, h: 18 },
    }),
  );
  objects.push(
    t('contact', {
      text: 'hello@pdfstudio.tech\n+1 (555) 123-4567\npdfstudio.tech',
      color: soft,
      fontSize: 10,
      font: { family: 'Inter', size: 10 },
      lineHeight: 1.35,
      rect: { x: leftX + 110, y: 104, w: leftW - 130, h: 52 },
    }),
  );

  // Big header (right-top)
  objects.push(
    t('myresume', {
      text: 'MY\nRESUME',
      color: white,
      fontSize: 44,
      font: { family: 'Inter', size: 44, bold: true },
      lineHeight: 0.95,
      rect: { x: rightX + 22, y: 56, w: rightW - 44, h: 100 },
    }),
  );
  objects.push(
    s('accent-line', {
      shapeType: 'rect',
      x: rightX + 24,
      y: 154,
      w: 140,
      h: 4,
      rotation: 0,
      zIndex: 3,
      style: { fill: accent, stroke: 'none', strokeWidth: 0, opacity: 0.75 },
    }),
  );

  // ABOUT ME (left-mid)
  objects.push(
    t('about-h', {
      text: 'ABOUT ME',
      color: accent,
      fontSize: 12,
      font: { family: 'Inter', size: 12, bold: true },
      letterSpacing: 1.2 as any,
      rect: { x: leftX + 18, y: 238, w: leftW - 36, h: 18 },
    } as any),
  );
  objects.push(
    t('about', {
      text: 'A short summary that highlights your strengths, impact, and what you’re looking for. Keep this concise and skimmable for recruiters.',
      color: muted,
      fontSize: 10.5,
      font: { family: 'Inter', size: 10.5 },
      lineHeight: 1.45,
      rect: { x: leftX + 18, y: 262, w: leftW - 36, h: 78 },
    }),
  );

  // PERSONAL TRAITS (left-mid)
  objects.push(
    t('traits-h', {
      text: 'PERSONAL TRAITS',
      color: accent,
      fontSize: 12,
      font: { family: 'Inter', size: 12, bold: true },
      rect: { x: leftX + 18, y: 352, w: leftW - 36, h: 18 },
    }),
  );
  const traits = ['Detail-oriented', 'Calm under pressure', 'Fast learner', 'Team-first'];
  traits.forEach((txt, i) => {
    objects.push(
      t(`trait-${i}`, {
        text: `• ${txt}`,
        color: muted,
        fontSize: 10.5,
        font: { family: 'Inter', size: 10.5 },
        lineHeight: 1.25,
        rect: { x: leftX + 22, y: 376 + i * 18, w: leftW - 44, h: 16 },
      }),
    );
  });

  // EDUCATIONS (left-bottom)
  objects.push(
    t('edu-h', {
      text: 'EDUCATIONS',
      color: accent,
      fontSize: 12,
      font: { family: 'Inter', size: 12, bold: true },
      rect: { x: leftX + 18, y: 506, w: leftW - 36, h: 18 },
    }),
  );
  objects.push(
    t('edu-1', {
      text: 'B.S. Computer Science\nUniversity Name — 2018–2022',
      color: muted,
      fontSize: 10.5,
      font: { family: 'Inter', size: 10.5 },
      lineHeight: 1.35,
      rect: { x: leftX + 18, y: 530, w: leftW - 36, h: 42 },
    }),
  );
  objects.push(
    t('edu-2', {
      text: 'Certificate — UX / Product\nProgram Name — 2023',
      color: muted,
      fontSize: 10.5,
      font: { family: 'Inter', size: 10.5 },
      lineHeight: 1.35,
      rect: { x: leftX + 18, y: 578, w: leftW - 36, h: 42 },
    }),
  );

  // Area of Expertise diagram (right-mid)
  objects.push(
    t('expert-h', {
      text: 'AREA OF EXPERTISE',
      color: accent,
      fontSize: 12,
      font: { family: 'Inter', size: 12, bold: true },
      rect: { x: rightX + 18, y: 238, w: rightW - 36, h: 18 },
    }),
  );

  const cx = rightX + 70;
  const cy = 318;
  const r = 34;
  const labels = ['UI Design', 'Brand', 'Systems', 'Research'];
  const offsets = [
    { x: 0, y: 0 },
    { x: 88, y: -6 },
    { x: 10, y: 80 },
    { x: 98, y: 78 },
  ];
  offsets.forEach((o, i) => {
    objects.push(
      s(`exp-c-${i}`, {
        shapeType: 'circle',
        x: cx + o.x,
        y: cy + o.y,
        w: r * 2,
        h: r * 2,
        rotation: 0,
        zIndex: 3,
        style: { fill: 'rgba(255,255,255,0.02)', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 1.5, opacity: 1 },
      }),
    );
    objects.push(
      t(`exp-l-${i}`, {
        text: labels[i],
        color: white,
        fontSize: 10,
        font: { family: 'Inter', size: 10, bold: true },
        align: 'center',
        lineHeight: 1.1,
        rect: { x: cx + o.x - 6, y: cy + o.y + r - 6, w: r * 2 + 12, h: 22 },
      }),
    );
  });

  // Sparkles
  objects.push(
    s('spark-1', {
      shapeType: 'star',
      x: rightX + 196,
      y: 250,
      w: 14,
      h: 14,
      rotation: 15,
      zIndex: 4,
      style: { fill: 'rgba(255,255,255,0.65)', stroke: 'none', strokeWidth: 0, opacity: 0.22 },
    }),
  );
  objects.push(
    s('spark-2', {
      shapeType: 'star',
      x: rightX + 220,
      y: 280,
      w: 10,
      h: 10,
      rotation: -10,
      zIndex: 4,
      style: { fill: accent, stroke: 'none', strokeWidth: 0, opacity: 0.18 },
    }),
  );

  // EXPERIENCE (right-bottom)
  objects.push(
    t('exp-h', {
      text: 'EXPERIENCE',
      color: accent,
      fontSize: 12,
      font: { family: 'Inter', size: 12, bold: true },
      rect: { x: rightX + 18, y: 516, w: rightW - 36, h: 18 },
    }),
  );

  const jobs = [
    { years: '2024–2026', role: 'Product Designer', company: 'Company Name', desc: 'Shipped features, improved conversion, and built design systems.' },
    { years: '2022–2024', role: 'Frontend Developer', company: 'Company Name', desc: 'Built accessible UI, improved performance, and collaborated cross-functionally.' },
  ];

  jobs.forEach((j, i) => {
    const y = 540 + i * 78;
    objects.push(
      t(`job-y-${i}`, {
        text: j.years,
        color: soft,
        fontSize: 10,
        font: { family: 'Inter', size: 10, bold: true },
        rect: { x: rightX + 18, y, w: 70, h: 16 },
      }),
    );
    objects.push(
      t(`job-r-${i}`, {
        text: `${j.role} — ${j.company}`,
        color: white,
        fontSize: 11,
        font: { family: 'Inter', size: 11, bold: true },
        rect: { x: rightX + 92, y, w: rightW - 110, h: 16 },
      }),
    );
    objects.push(
      t(`job-d-${i}`, {
        text: j.desc,
        color: muted,
        fontSize: 10.5,
        font: { family: 'Inter', size: 10.5 },
        lineHeight: 1.35,
        rect: { x: rightX + 92, y: y + 18, w: rightW - 110, h: 44 },
      }),
    );
  });

  return objects;
}

export async function applyModernDarkResumeToEditor(params: {
  store: UseBoundStore<StoreApi<any>>;
  title: string;
}): Promise<void> {
  const state = params.store.getState() as DocumentStoreShape;
  await state.newDoc();
  state.setDocTitle(params.title);

  const bg = buildBackground();
  state.setPageBackground(0, { src: bg.src, opacity: bg.opacity });

  const objects = buildModernDarkResumeObjects();
  for (const obj of objects) state.addOverlayObject(0, obj);
}
