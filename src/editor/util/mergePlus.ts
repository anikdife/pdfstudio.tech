import { mergePdfBytes } from '../pageops/merge';

export async function mergePlusFilesToFile(params: {
  files: File[];
  outputBaseName?: string;
}): Promise<File> {
  const files = params.files.filter((f) => f.type === 'application/pdf');
  if (files.length === 0) throw new Error('No PDFs selected');

  if (files.length === 1) return files[0];

  let mergedBytes: Uint8Array = new Uint8Array((await files[0].arrayBuffer()) as ArrayBuffer);
  for (let i = 1; i < files.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const otherBytes = new Uint8Array((await files[i].arrayBuffer()) as ArrayBuffer);
    // eslint-disable-next-line no-await-in-loop
    const merged = await mergePdfBytes({ basePdfBytes: mergedBytes, otherPdfBytes: otherBytes });
    mergedBytes = merged.bytes;
  }

  const mergedForFile = new Uint8Array(mergedBytes);
  const outFile = new File(
    [mergedForFile],
    `${params.outputBaseName || 'document'}-merged.pdf`,
    { type: 'application/pdf' },
  );

  return outFile;
}
