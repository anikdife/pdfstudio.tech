import JSZip from 'jszip';

export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/octet-stream') {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadZipFiles(
  files: Array<{ filename: string; bytes: Uint8Array }>,
  zipFilename: string,
): Promise<void> {
  if (!files.length) return;
  if (files.length === 1) {
    downloadBytes(files[0].bytes, files[0].filename);
    return;
  }

  const zip = new JSZip();
  const used = new Map<string, number>();

  for (const f of files) {
    const rawName = String(f.filename || 'file');
    const n = (used.get(rawName) ?? 0) + 1;
    used.set(rawName, n);
    const name = n > 1 ? rawName.replace(/(\.[^.]*)?$/g, `-${n}$1`) : rawName;
    zip.file(name, f.bytes);
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  downloadBytes(zipBytes, zipFilename, 'application/zip');
}

export async function fileToBytes(file: File) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
