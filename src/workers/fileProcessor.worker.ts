/// <reference lib="webworker" />

import type {
  ParserPage,
  ParserResult,
  WorkerParseRequest,
  WorkerParseResponse,
  ParsedImageMeta,
} from './fileProcessorTypes';

declare const mammoth: any;
declare const XLSX: any;
declare const marked: any;
declare const JSZip: any;

type ScriptKey = 'mammoth' | 'xlsx' | 'marked' | 'jszip';

const loadedScripts = new Set<ScriptKey>();

function scriptUrl(pathFromPublicScripts: string) {
  // /public is served at the app root.
  return new URL(`/scripts/${pathFromPublicScripts}`, self.location.origin).toString();
}

function ensureScript(key: ScriptKey) {
  if (loadedScripts.has(key)) return;

  if (key === 'mammoth') {
    // expected: window.mammoth
    (self as any).importScripts(scriptUrl('mammoth.browser.min.js'));
    loadedScripts.add(key);
    return;
  }

  if (key === 'xlsx') {
    // expected: window.XLSX
    (self as any).importScripts(scriptUrl('xlsx.full.min.js'));
    loadedScripts.add(key);
    return;
  }

  if (key === 'marked') {
    // expected: window.marked
    (self as any).importScripts(scriptUrl('marked.umd.js'));
    loadedScripts.add(key);
    return;
  }

  if (key === 'jszip') {
    // expected: window.JSZip
    (self as any).importScripts(scriptUrl('jszip.min.js'));
    loadedScripts.add(key);
    return;
  }

  // Exhaustive
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unknown script key: ${key}`);
}

function dirname(path: string) {
  const normalized = path.replaceAll('\\', '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx + 1) : '';
}

function normalizePath(path: string) {
  const raw = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = raw.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      out.pop();
      continue;
    }
    out.push(p);
  }
  return out.join('/');
}

function joinPath(baseDir: string, relative: string) {
  const rel = relative.replaceAll('\\', '/');
  if (!rel) return normalizePath(baseDir);
  if (/^[a-z]+:\/\//i.test(rel)) return rel;
  if (rel.startsWith('/')) return normalizePath(rel.slice(1));
  return normalizePath(`${baseDir}${rel}`);
}

function stripUtf8Bom(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.slice(3) : bytes;
}

function u8ToBase64(bytes: Uint8Array) {
  // Avoid stack overflows by chunking.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function stripUrlFragmentAndQuery(url: string) {
  const s = url.trim();
  if (!s) return s;
  const hash = s.indexOf('#');
  const q = s.indexOf('?');
  let end = s.length;
  if (hash >= 0) end = Math.min(end, hash);
  if (q >= 0) end = Math.min(end, q);
  return s.slice(0, end);
}

function escapeHtmlAttr(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function guessContentTypeFromPath(path: string): string {
  const ext = extOf(path);
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'avif') return 'image/avif';
  return 'image/*';
}

function swap16(bytes: Uint8Array) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out[i] = bytes[i + 1];
    out[i + 1] = bytes[i];
  }
  return out;
}

function decodeTextBestEffort(bytesIn: Uint8Array): string {
  let bytes = bytesIn;

  // BOM detection first.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    bytes = bytes.slice(2);
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    bytes = bytes.slice(2);
    return new TextDecoder('utf-16le').decode(swap16(bytes));
  }

  bytes = stripUtf8Bom(bytes);

  // Try to sniff encoding from XML declaration.
  try {
    const head = new TextDecoder('utf-8').decode(bytes.slice(0, 512));
    const m = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
    const enc = m?.[1]?.trim();
    if (enc) {
      try {
        return new TextDecoder(enc).decode(bytes);
      } catch {
        // fall through
      }
    }
  } catch {
    // ignore
  }

  return new TextDecoder('utf-8').decode(bytes);
}

function extOf(nameOrExt: string) {
  const s = nameOrExt.trim().toLowerCase();
  if (s.startsWith('.')) return s.slice(1);
  const idx = s.lastIndexOf('.');
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function paginateBlocks(blocks: string[], blocksPerPage = 18): ParserPage[] {
  const pages: ParserPage[] = [];
  for (let i = 0; i < blocks.length; i += blocksPerPage) {
    const slice = blocks.slice(i, i + blocksPerPage).join('\n');
    pages.push({ kind: 'html', html: `<div>${slice}</div>` });
  }
  return pages.length ? pages : [{ kind: 'html', html: '<div></div>' }];
}

function splitOversizedHtmlBlock(html: string, maxChars = 9000): string[] {
  const normalized = html.trim();
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += maxChars) {
    chunks.push(normalized.slice(i, i + maxChars));
  }
  return chunks;
}

function paginateHtml(html: string): ParserPage[] {
  const normalized = html.trim();
  if (!normalized) return [{ kind: 'html', html: '<div></div>' }];

  // Very lightweight heuristic pagination: split on common block boundaries.
  const partsRaw = normalized
    .split(/(?=<h1\b|<h2\b|<h3\b|<p\b|<li\b|<table\b|<blockquote\b)/gi)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const p of partsRaw) {
    parts.push(...splitOversizedHtmlBlock(p));
  }

  return paginateBlocks(parts, 20);
}

function parseXmlAttr(tag: string, name: string) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return tag.match(re)?.[1];
}

function extractOpfTitle(opfXml: string) {
  const m = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  return m?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || undefined;
}

function extractHtmlTitle(docHtml: string) {
  const m = docHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || undefined;
}

function extractBodyInnerHtml(docHtml: string) {
  const m = docHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (m?.[1] ?? docHtml).trim();
}

function cleanupEpubHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<title\b[\s\S]*?<\/title>/gi, '')
    .trim();
}

async function parseDocxLike(params: { buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  ensureScript('mammoth');

  const images: ParsedImageMeta[] = [];
  const warnings: string[] = [];

  // mammoth exposes images helpers; keep it best-effort.
  const options: any = {
    convertImage: (mammoth?.images?.inline
      ? mammoth.images.inline(async (image: any) => {
          const base64 = await image.read('base64');
          const id = `img-${images.length + 1}`;
          images.push({
            id,
            contentType: image.contentType || 'image/*',
            base64,
            position: { type: 'order', index: images.length },
          });
          return { src: `data:${image.contentType};base64,${base64}` };
        })
      : undefined),
  };

  const result = await mammoth.convertToHtml({ arrayBuffer: params.buffer }, options);

  const html = String(result?.value ?? '');
  const msgs = Array.isArray(result?.messages) ? result.messages : [];
  for (const m of msgs) {
    const msg = typeof m?.message === 'string' ? m.message : String(m);
    if (msg) warnings.push(msg);
  }

  return {
    kind: 'doc',
    title: params.title,
    pages: paginateHtml(html),
    images: images.length ? images : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

async function parseOdtLike(params: { buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  // Prefer mammoth if it supports the file in this environment.
  try {
    return await parseDocxLike(params);
  } catch {
    // Fallback: ODT is a zip containing content.xml.
    ensureScript('jszip');
    const zip = await JSZip.loadAsync(params.buffer);
    const candidates = ['content.xml', 'Content.xml'];
    let contentFile: any = null;
    for (const c of candidates) {
      contentFile = zip.file(c);
      if (contentFile) break;
    }
    if (!contentFile) {
      // Best-effort: find any content.xml regardless of directory.
      const keys = Object.keys(zip.files || {});
      const hit = keys.find((k) => k.toLowerCase().endsWith('/content.xml') || k.toLowerCase() === 'content.xml');
      contentFile = hit ? zip.file(hit) : null;
    }
    if (!contentFile) throw new Error('Invalid ODT: missing content.xml');

    const xmlBytes = await contentFile.async('uint8array');
    const xml = decodeTextBestEffort(xmlBytes);
    // Strip tags and normalize whitespace.
    const text = xml
      .replace(/<text:tab\b[^>]*\/>/gi, '\t')
      .replace(/<text:line-break\b[^>]*\/>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Reuse the txt pagination logic.
    const lines = text.split(/\r?\n/);
    const blocks: string[] = [];
    for (let i = 0; i < lines.length; i += 40) {
      const chunk = lines.slice(i, i + 40).join('\n');
      blocks.push(`<pre style="white-space:pre-wrap">${escapeHtml(chunk)}</pre>`);
    }

    return {
      kind: 'doc',
      title: params.title,
      pages: blocks.length ? blocks.map((html) => ({ kind: 'html', html })) : [{ kind: 'html', html: '<div></div>' }],
      warnings: ['ODT parsed via fallback (limited formatting).'],
    };
  }
}

function extractStringsBestEffort(bytes: Uint8Array): string {
  // Best-effort legacy .doc: extract printable ASCII and UTF-16LE strings.
  // This keeps LOC low and avoids heavy OLE parsing libraries.
  const out: string[] = [];

  const pushIfOk = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length >= 8) out.push(t);
  };

  // ASCII runs
  let buf = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const ok = b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126);
    if (ok) {
      buf += String.fromCharCode(b);
      if (buf.length > 1800) {
        pushIfOk(buf);
        buf = '';
      }
    } else {
      pushIfOk(buf);
      buf = '';
    }
  }
  pushIfOk(buf);

  // UTF-16LE runs (common in Office docs): look for [printable][0] patterns.
  let run: number[] = [];
  const flush16 = () => {
    if (run.length < 16) {
      run = [];
      return;
    }
    const u8 = new Uint8Array(run);
    try {
      const s = new TextDecoder('utf-16le').decode(u8);
      pushIfOk(s);
    } catch {
      // ignore
    }
    run = [];
  };

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    const ok = hi === 0 && (lo === 9 || lo === 10 || lo === 13 || (lo >= 32 && lo <= 126));
    if (ok) {
      run.push(lo, hi);
      if (run.length > 3600) flush16();
    } else {
      flush16();
    }
  }
  flush16();

  // De-dupe while preserving order.
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const s of out) {
    if (seen.has(s)) continue;
    seen.add(s);
    uniq.push(s);
    if (uniq.length >= 220) break;
  }

  return uniq.join('\n');
}

async function parseLegacyDocLike(params: { buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  const bytes = new Uint8Array(params.buffer);
  const text = extractStringsBestEffort(bytes);

  if (!text.trim()) {
    throw new Error('Unable to extract text from .doc (please convert to .docx)');
  }

  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 40) {
    const chunk = lines.slice(i, i + 40).join('\n');
    blocks.push(`<pre style="white-space:pre-wrap">${escapeHtml(chunk)}</pre>`);
  }

  return {
    kind: 'doc',
    title: params.title,
    pages: blocks.length ? blocks.map((html) => ({ kind: 'html', html })) : [{ kind: 'html', html: '<div></div>' }],
    warnings: ['Legacy .doc parsed via text extraction (limited formatting).'],
  };
}

function sheetToHtmlSafe(workbook: any, sheetName: string): string {
  const ws = workbook.Sheets?.[sheetName];
  if (!ws) return '<div></div>';
  try {
    return String(XLSX.utils.sheet_to_html(ws));
  } catch {
    // fallback minimal
    const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
    return `<pre>${escapeHtml(JSON.stringify(json, null, 2))}</pre>`;
  }
}

function sheetToTsvPages(workbook: any, sheetName: string): ParserPage[] {
  const ws = workbook.Sheets?.[sheetName];
  if (!ws) return [{ kind: 'html', title: sheetName, html: '<div></div>' }];

  let rows: any[] = [];
  try {
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } catch {
    // fallback to HTML if TSV conversion fails
    return paginateHtml(sheetToHtmlSafe(workbook, sheetName)).map((p, i) => ({
      ...p,
      title: i === 0 ? sheetName : `${sheetName} (${i + 1})`,
    }));
  }

  const cellText = (cell: any) => {
    if (cell == null) return '';
    if (typeof cell === 'string') return cell;
    if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
    return JSON.stringify(cell);
  };

  // Compute fixed widths so columns align in monospace.
  const tableRows: string[][] = rows
    .filter((r) => Array.isArray(r))
    .map((r) => (r as any[]).map(cellText));

  const colCount = tableRows.reduce((m, r) => Math.max(m, r.length), 0);
  const colWidths = Array.from({ length: colCount }, () => 0);
  const maxColWidth = 28;
  for (const r of tableRows) {
    for (let c = 0; c < colCount; c++) {
      const t = (r[c] ?? '').toString();
      colWidths[c] = Math.min(maxColWidth, Math.max(colWidths[c], t.length));
    }
  }

  const padRight = (s: string, w: number) => {
    const t = (s ?? '').toString();
    if (t.length >= w) return t.slice(0, w);
    return t + ' '.repeat(w - t.length);
  };

  const lines: string[] = [];
  lines.push(`Sheet: ${sheetName}`);
  lines.push('');

  const sep = '  ';
  for (const r of tableRows) {
    const cols: string[] = [];
    for (let c = 0; c < colCount; c++) {
      cols.push(padRight(r[c] ?? '', colWidths[c]));
    }
    // Don't trimEnd; trailing spaces are part of alignment.
    lines.push(cols.join(sep));
  }

  const pages: ParserPage[] = [];
  const linesPerPage = 45;
  for (let i = 0; i < lines.length; i += linesPerPage) {
    const chunk = lines.slice(i, i + linesPerPage).join('\n');
    pages.push({
      kind: 'html',
      title: i === 0 ? sheetName : `${sheetName} (${Math.floor(i / linesPerPage) + 1})`,
      html: `<pre style="white-space:pre">${escapeHtml(chunk)}</pre>`,
    });
  }

  return pages.length ? pages : [{ kind: 'html', title: sheetName, html: '<div></div>' }];
}

async function parseSheetLike(params: { extension: string; buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  ensureScript('xlsx');

  const ext = params.extension;
  let workbook: any;

  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(params.buffer));
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    workbook = XLSX.read(params.buffer, { type: 'array' });
  }

  const sheetNames: string[] = workbook.SheetNames || [];
  const pages: ParserPage[] = [];

  for (const name of sheetNames) {
    pages.push(...sheetToTsvPages(workbook, name));
  }

  return {
    kind: 'sheet',
    title: params.title,
    pages: pages.length ? pages : [{ kind: 'html', html: '<div></div>' }],
  };
}

async function parseTextLike(params: { extension: string; buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  const ext = params.extension;
  const text = new TextDecoder('utf-8').decode(new Uint8Array(params.buffer));

  if (ext === 'md') {
    ensureScript('marked');
    const html = typeof marked?.parse === 'function' ? marked.parse(text) : `<pre>${escapeHtml(text)}</pre>`;
    return { kind: 'text', title: params.title, pages: paginateHtml(String(html)) };
  }

  // .txt
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 40) {
    const chunk = lines.slice(i, i + 40).join('\n');
    blocks.push(`<pre style="white-space:pre-wrap">${escapeHtml(chunk)}</pre>`);
  }

  return {
    kind: 'text',
    title: params.title,
    pages: blocks.length ? blocks.map((html) => ({ kind: 'html', html })) : [{ kind: 'html', html: '<div></div>' }],
  };
}

async function parseEpubLike(params: { buffer: ArrayBuffer; title?: string }): Promise<ParserResult> {
  const warnings: string[] = [];
  ensureScript('jszip');
  const zip = await JSZip.loadAsync(params.buffer);

  const allNames = Object.keys(zip.files);
  const lowerToReal = new Map<string, string>();
  for (const n of allNames) lowerToReal.set(n.toLowerCase(), n);

  const getFileBytes = async (path: string): Promise<Uint8Array> => {
    const key = lowerToReal.get(path.toLowerCase());
    if (!key) throw new Error(`EPUB missing file: ${path}`);
    const f = zip.file(key);
    if (!f) throw new Error(`EPUB missing file: ${path}`);
    return f.async('uint8array');
  };

  const containerCandidate = lowerToReal.get('meta-inf/container.xml');
  if (!containerCandidate) throw new Error('Invalid EPUB: missing META-INF/container.xml');
  const containerText = decodeTextBestEffort(await getFileBytes(containerCandidate));
  const rootMatch = containerText.match(/full-path\s*=\s*["']([^"']+)["']/i);
  if (!rootMatch?.[1]) throw new Error('Invalid EPUB: unable to find OPF full-path');
  const opfPath = normalizePath(rootMatch[1]);
  const opfReal = lowerToReal.get(opfPath.toLowerCase());
  if (!opfReal) throw new Error(`Invalid EPUB: missing OPF at ${opfPath}`);

  const opfText = decodeTextBestEffort(await getFileBytes(opfReal));
  const bookTitle = extractOpfTitle(opfText) ?? params.title;

  const manifest = new Map<string, { href: string; mediaType?: string }>();
  const manifestHrefToMediaType = new Map<string, string>();
  for (const m of opfText.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0];
    const id = parseXmlAttr(tag, 'id');
    const href = parseXmlAttr(tag, 'href');
    if (!id || !href) continue;
    const mediaType = parseXmlAttr(tag, 'media-type') ?? undefined;
    manifest.set(id, { href, mediaType });

    // Normalize href → absolute path in the zip for later image lookups.
    const resolved = joinPath(dirname(opfPath), href);
    if (mediaType) manifestHrefToMediaType.set(resolved.toLowerCase(), mediaType);
  }

  const spine: string[] = [];
  for (const m of opfText.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = parseXmlAttr(m[0], 'idref');
    if (idref) spine.push(idref);
  }
  if (!spine.length) warnings.push('EPUB: spine is empty (no readable chapters found)');

  const baseDir = dirname(opfPath);
  const pages: ParserPage[] = [];
  const images: ParsedImageMeta[] = [];
  const seenImagePaths = new Set<string>();
  const maxImages = 24;
  const maxImageBytes = 3_000_000;

  const pushImage = async (opts: {
    imgZipPathLower: string;
    imgReal: string;
    pageIndex: number;
  }) => {
    try {
      const bytes = await getFileBytes(opts.imgReal);
      if (bytes.length > maxImageBytes) {
        warnings.push(`EPUB: skipped large image (${Math.round(bytes.length / 1024)}KB): ${opts.imgReal}`);
        return;
      }
      const base64 = u8ToBase64(bytes);
      const contentType =
        manifestHrefToMediaType.get(opts.imgZipPathLower) ??
        manifestHrefToMediaType.get(normalizePath(opts.imgReal).toLowerCase()) ??
        guessContentTypeFromPath(opts.imgReal);
      images.push({
        id: opts.imgReal,
        contentType,
        base64,
        position: { type: 'page', pageIndex: opts.pageIndex, index: images.length },
      });
    } catch {
      warnings.push(`EPUB: failed to read image: ${opts.imgReal}`);
    }
  };

  for (let i = 0; i < spine.length; i++) {
    const idref = spine[i];
    const item = manifest.get(idref);
    if (!item?.href) {
      warnings.push(`EPUB: missing manifest item for spine idref: ${idref}`);
      continue;
    }

    const target = joinPath(baseDir, item.href);
    const real = lowerToReal.get(target.toLowerCase());
    if (!real) {
      warnings.push(`EPUB: missing spine file: ${target}`);
      continue;
    }

    const rawHtml = decodeTextBestEffort(await getFileBytes(real));
    const chapterTitle = extractHtmlTitle(rawHtml) ?? `Chapter ${i + 1}`;
    let bodyRaw = extractBodyInnerHtml(rawHtml);

    const chapterStartPageIndex = pages.length;

    // Best-effort: extract referenced images and return them as overlays.
    // Also insert marker paragraphs into the chapter HTML so the main thread can place images inline.
    if (images.length < maxImages) {
      const chapterDir = dirname(target);
      const extractedByZipPathLower = new Map<string, string>();

      for (const m of bodyRaw.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        if (images.length >= maxImages) break;
        const src = stripUrlFragmentAndQuery(m[1] ?? '');
        if (!src || src.startsWith('data:') || /^[a-z]+:\/\//i.test(src)) continue;

        const imgPath = joinPath(chapterDir, src);
        const keyLower = imgPath.toLowerCase();
        if (seenImagePaths.has(keyLower)) continue;
        seenImagePaths.add(keyLower);

        const imgReal = lowerToReal.get(keyLower);
        if (!imgReal) {
          warnings.push(`EPUB: missing image: ${imgPath}`);
          continue;
        }

        // Assign to the chapter start page; the editor can place these near the chapter text.
        // eslint-disable-next-line no-await-in-loop
        await pushImage({ imgZipPathLower: keyLower, imgReal, pageIndex: chapterStartPageIndex });
        extractedByZipPathLower.set(keyLower, imgReal);
      }

      // Replace img tags with lightweight marker paragraphs for inline placement.
      // Keep the document readable even if images are skipped.
      if (extractedByZipPathLower.size) {
        const markerize = (match: string, srcRaw: string) => {
          const src = stripUrlFragmentAndQuery(srcRaw ?? '');
          if (!src || src.startsWith('data:') || /^[a-z]+:\/\//i.test(src)) return match;
          const zipPathLower = joinPath(chapterDir, src).toLowerCase();
          const imgId = extractedByZipPathLower.get(zipPathLower);
          if (!imgId) return match;
          return `<p data-epub-img="${escapeHtmlAttr(imgId)}"></p>`;
        };
        bodyRaw = bodyRaw.replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, markerize);
      }
    }

    const bodyHtml = cleanupEpubHtml(bodyRaw);
    const chapterHtml = `<div class="epubChapter"><h2>${escapeHtml(chapterTitle)}</h2>${bodyHtml}</div>`;

    const chapterPages = paginateHtml(chapterHtml);
    if (chapterPages.length) {
      chapterPages[0] = { ...chapterPages[0], title: chapterTitle };
      pages.push(...chapterPages);
    }
  }

  return {
    kind: 'text',
    title: bookTitle,
    pages: pages.length ? pages : [{ kind: 'html', html: '<div></div>' }],
    images: images.length ? images : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

async function processFile(req: WorkerParseRequest): Promise<ParserResult> {
  const ext = extOf(req.extension || req.fileName);
  const title = req.fileName;

  if (ext === 'docx') {
    return parseDocxLike({ buffer: req.buffer, title });
  }

  if (ext === 'odt') {
    return parseOdtLike({ buffer: req.buffer, title });
  }

  if (ext === 'doc') {
    return parseLegacyDocLike({ buffer: req.buffer, title });
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'ods') {
    return parseSheetLike({ extension: ext, buffer: req.buffer, title });
  }

  if (ext === 'md' || ext === 'txt') {
    return parseTextLike({ extension: ext, buffer: req.buffer, title });
  }

  if (ext === 'epub') {
    return parseEpubLike({ buffer: req.buffer, title });
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

self.onmessage = (ev: MessageEvent<WorkerParseRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'parse') return;

  (async () => {
    try {
      const result = await processFile(msg);
      const res: WorkerParseResponse = { type: 'result', requestId: msg.requestId, result };
      (self as any).postMessage(res);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Worker failed');
      const res: WorkerParseResponse = {
        type: 'error',
        requestId: msg.requestId,
        error: { message: e.message, stack: e.stack },
      };
      (self as any).postMessage(res);
    }
  })();
};
