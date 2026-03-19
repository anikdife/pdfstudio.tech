import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';

// Vite-friendly worker URL (pdfjs-dist v4 ships ESM workers)
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let userCancelledPassword = false;

  const requestPasswordViaModal = (() => {
    let inFlight: Promise<string | null> | null = null;
    return async (opts: { incorrect: boolean }): Promise<string | null> => {
      if (typeof document === 'undefined') return null;
      if (inFlight) return inFlight;

      inFlight = new Promise<string | null>((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modalBackdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'modalCard';
        backdrop.appendChild(card);

        const header = document.createElement('div');
        header.className = 'modalHeader';
        header.innerHTML = `<div>${opts.incorrect ? 'Incorrect password' : 'Password required'}</div>`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Close';
        header.appendChild(closeBtn);
        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'modalBody';

        const hint = document.createElement('div');
        hint.className = 'muted';
        hint.textContent = opts.incorrect
          ? 'That password did not work. Please try again.'
          : 'This PDF is password-protected. Enter the password to open it.';
        body.appendChild(hint);

        const input = document.createElement('input');
        input.type = 'password';
        input.placeholder = 'Enter password';
        input.autocomplete = 'current-password';
        (input as any).spellcheck = false;
        input.style.width = '100%';
        input.style.marginTop = '10px';
        body.appendChild(input);
        card.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'modalFooter';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = 'Open';
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        card.appendChild(footer);

        const cleanup = (value: string | null) => {
          try {
            backdrop.remove();
          } catch {
            // ignore
          }
          resolve(value);
        };

        const onCancel = () => cleanup(null);
        const onOk = () => cleanup(String(input.value ?? ''));

        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onOk();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        });
        backdrop.addEventListener('mousedown', (e) => {
          if (e.target === backdrop) onCancel();
        });

        document.body.appendChild(backdrop);
        window.setTimeout(() => {
          try {
            input.focus();
            input.select();
          } catch {
            // ignore
          }
        }, 0);
      }).finally(() => {
        inFlight = null;
      });

      return inFlight;
    };
  })();
  const isPasswordError = (e: any): boolean => {
    const name = String(e?.name ?? '').toLowerCase();
    const msg = String(e?.message ?? '').toLowerCase();
    if (name.includes('password')) return true;
    if (msg.includes('password')) return true;
    if (msg.includes('no password given')) return true;
    if (msg.includes('incorrect password')) return true;
    return false;
  };

  const runGetDocument = async (opts?: { password?: string }): Promise<PDFDocumentProxy> => {
    // IMPORTANT:
    // pdf.js may transfer the provided ArrayBuffer to its worker, detaching it.
    // Each getDocument() call must receive a fresh copy, especially when retrying with a password.
    const data = bytes.slice();
    const task = getDocument({
      data,
      password: opts?.password,
      // Keep onPassword as a secondary path when pdf.js does invoke it.
      onPassword: (updatePassword: (pw: string) => void, reason: any) => {
        const reasonNum = typeof reason === 'number' ? reason : Number(reason);
        const isIncorrect = reasonNum === 2;
        void (async () => {
          const pw = await requestPasswordViaModal({ incorrect: isIncorrect });
          if (pw == null) {
            userCancelledPassword = true;
            updatePassword('');
            return;
          }
          if (!pw) userCancelledPassword = true;
          updatePassword(pw);
        })();
      },
    } as any);
    return await task.promise;
  };

  try {
    return await runGetDocument();
  } catch (e1: any) {
    if (!isPasswordError(e1)) throw e1;

    // Some pdf.js builds reject early with "No password given" without reliably invoking onPassword.
    // In that case, explicitly prompt and retry using the `password` option.
    const pw = await requestPasswordViaModal({ incorrect: false });
    if (pw == null || pw === '') {
      userCancelledPassword = true;
      throw new Error('Password not given');
    }

    try {
      return await runGetDocument({ password: pw });
    } catch (e2: any) {
      // If incorrect, allow one more retry loop so the user can fix typos.
      if (!isPasswordError(e2)) throw e2;
      const pw2 = await requestPasswordViaModal({ incorrect: true });
      if (pw2 == null || pw2 === '') {
        userCancelledPassword = true;
        throw new Error('Password not given');
      }
      return await runGetDocument({ password: pw2 });
    }
  }
}

export async function getPageViewportSize(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<{ w: number; h: number }> {
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  return { w: viewport.width, h: viewport.height };
}

export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  canvas: HTMLCanvasElement,
  rotation: number = 0,
  maxDprOverride?: number,
): Promise<void> {
  // pdf.js cannot render concurrently into the same canvas.
  // If a new render is requested (zoom/page change, progressive refinement, etc.),
  // cancel any previous in-flight render for this canvas.
  type RenderTaskLike = { promise: Promise<any>; cancel: () => void };
  const w = window as any;
  const mapKey = '__xpdf_canvasRenderTaskMap';
  const taskMap: WeakMap<HTMLCanvasElement, RenderTaskLike> = (w[mapKey] ||= new WeakMap());
  const prev = taskMap.get(canvas);
  if (prev) {
    try {
      prev.cancel();
    } catch {
      // ignore
    }
  }

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale, rotation });

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');

  let maxDpr = 2;
  if (typeof maxDprOverride === 'number' && Number.isFinite(maxDprOverride) && maxDprOverride > 0) {
    maxDpr = Math.max(0.5, Math.min(4, maxDprOverride));
  } else {
    try {
      const raw = window.localStorage?.getItem('xpdf:render:maxDpr');
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) maxDpr = Math.max(0.75, Math.min(4, n));
    } catch {
      // ignore
    }
  }
  const outputScale = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const task = page.render({ canvasContext: ctx as any, viewport } as any) as any as RenderTaskLike;
  taskMap.set(canvas, task);
  try {
    await task.promise;
  } catch (e: any) {
    // Cancellation is expected when a new render supersedes an old one.
    const name = String(e?.name ?? '');
    const msg = String(e?.message ?? '');
    if (name.includes('RenderingCancelled') || msg.toLowerCase().includes('cancel')) {
      return;
    }
    throw e;
  } finally {
    // Only clear if we are still the latest task for this canvas.
    if (taskMap.get(canvas) === task) taskMap.delete(canvas);
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = t1 - t0;
  if (dt > 600) {
    try {
      // eslint-disable-next-line no-console
      console.warn('[xpdf:perf] renderPageToCanvas(ms)=', Math.round(dt), {
        page: pageIndex + 1,
        scale: Math.round(scale * 100) / 100,
        rotation,
        dpr: Math.round(outputScale * 100) / 100,
        canvas: { w: canvas.width, h: canvas.height },
      });
    } catch {
      // ignore
    }
  }
}

export async function renderPageToBitmap(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(doc, pageIndex, scale, canvas);
  return await createImageBitmap(canvas);
}
