export type PageRange = { start: number; end: number }; // 0-based inclusive

export function parseRanges(input: string, total: number): { ok: true; ranges: PageRange[] } | { ok: false; error: string } {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Enter one or more ranges, e.g. 1-3,5,7-9' };

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const ranges: PageRange[] = [];

  for (const part of parts) {
    const m = part.match(/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/);
    if (!m) return { ok: false, error: `Invalid range: ${part}` };

    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: `Invalid range: ${part}` };

    let start = Math.min(a, b) - 1;
    let end = Math.max(a, b) - 1;

    if (total <= 0) return { ok: false, error: 'No pages' };

    start = Math.max(0, Math.min(start, total - 1));
    end = Math.max(0, Math.min(end, total - 1));

    ranges.push({ start, end });
  }

  // Merge overlaps / adjacency
  ranges.sort((r1, r2) => r1.start - r2.start);
  const merged: PageRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last) merged.push({ ...r });
    else if (r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }

  return { ok: true, ranges: merged };
}

export function indicesFromRanges(ranges: PageRange[], total: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const r of ranges) {
    for (let i = r.start; i <= r.end; i++) {
      if (i < 0 || i >= total) continue;
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(i);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}
