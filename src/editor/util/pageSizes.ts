export type PageSizeUnit = 'mm' | 'in' | 'pt';

export type PageSizePreset = {
  id: string;
  label: string;
  widthPoints: number;
  heightPoints: number;
  category: 'ISO' | 'US';
  regionTags: string[];
};

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

export function inchesToPoints(inches: number): number {
  return inches * POINTS_PER_INCH;
}

export function mmToPoints(mm: number): number {
  return inchesToPoints(mm / MM_PER_INCH);
}

export function pointsToInches(points: number): number {
  return points / POINTS_PER_INCH;
}

export function pointsToMm(points: number): number {
  return pointsToInches(points) * MM_PER_INCH;
}

export const PAGE_SIZE_PRESETS: ReadonlyArray<PageSizePreset> = [
  // ISO
  {
    id: 'a5',
    label: 'A5',
    widthPoints: mmToPoints(148),
    heightPoints: mmToPoints(210),
    category: 'ISO',
    regionTags: ['ISO', 'EU', 'Global'],
  },
  {
    id: 'a4',
    label: 'A4',
    widthPoints: mmToPoints(210),
    heightPoints: mmToPoints(297),
    category: 'ISO',
    regionTags: ['ISO', 'EU', 'Global'],
  },
  {
    id: 'a3',
    label: 'A3',
    widthPoints: mmToPoints(297),
    heightPoints: mmToPoints(420),
    category: 'ISO',
    regionTags: ['ISO', 'EU', 'Global'],
  },

  // US
  {
    id: 'letter',
    label: 'Letter',
    widthPoints: inchesToPoints(8.5),
    heightPoints: inchesToPoints(11),
    category: 'US',
    regionTags: ['US', 'CA'],
  },
  {
    id: 'legal',
    label: 'Legal',
    widthPoints: inchesToPoints(8.5),
    heightPoints: inchesToPoints(14),
    category: 'US',
    regionTags: ['US', 'CA'],
  },
  {
    id: 'tabloid',
    label: 'Tabloid',
    widthPoints: inchesToPoints(11),
    heightPoints: inchesToPoints(17),
    category: 'US',
    regionTags: ['US', 'CA'],
  },
];

export function swapOrientation(size: { w: number; h: number }, orientation: 'portrait' | 'landscape') {
  const isLandscape = size.w >= size.h;
  if (orientation === 'landscape' && !isLandscape) return { w: size.h, h: size.w };
  if (orientation === 'portrait' && isLandscape) return { w: size.h, h: size.w };
  return size;
}

export function sizeToUnit(size: { w: number; h: number }, unit: PageSizeUnit): { w: number; h: number } {
  if (unit === 'pt') return { w: size.w, h: size.h };
  if (unit === 'in') return { w: pointsToInches(size.w), h: pointsToInches(size.h) };
  return { w: pointsToMm(size.w), h: pointsToMm(size.h) };
}

export function unitToPoints(size: { w: number; h: number }, unit: PageSizeUnit): { w: number; h: number } {
  if (unit === 'pt') return { w: size.w, h: size.h };
  if (unit === 'in') return { w: inchesToPoints(size.w), h: inchesToPoints(size.h) };
  return { w: mmToPoints(size.w), h: mmToPoints(size.h) };
}

export function findPresetForSize(size: { w: number; h: number }): { preset: PageSizePreset; orientation: 'portrait' | 'landscape' } | null {
  const tol = 0.75; // points tolerance

  for (const preset of PAGE_SIZE_PRESETS) {
    const pw = preset.widthPoints;
    const ph = preset.heightPoints;

    const portraitMatch = Math.abs(size.w - pw) <= tol && Math.abs(size.h - ph) <= tol;
    if (portraitMatch) return { preset, orientation: 'portrait' };

    const landscapeMatch = Math.abs(size.w - ph) <= tol && Math.abs(size.h - pw) <= tol;
    if (landscapeMatch) return { preset, orientation: 'landscape' };
  }

  return null;
}

export function formatSize(size: { w: number; h: number }, unit: PageSizeUnit): string {
  const converted = sizeToUnit(size, unit);
  const fmt = (n: number) => (unit === 'pt' ? Math.round(n).toString() : n.toFixed(1));
  return `${fmt(converted.w)} × ${fmt(converted.h)} ${unit}`;
}
