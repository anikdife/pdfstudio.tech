import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'xpdf-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '';

          // Default: keep the editor isolated so SharedArrayBuffer works (qpdf-wasm pthreads).
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

          // OAuth bridge pages must allow popups to preserve window.opener for Google Identity Services.
          if (url.startsWith('/auth/')) {
            // IMPORTANT: Firebase redirect sign-in stores state in sessionStorage.
            // With COOP enabled, cross-origin redirects can trigger a browsing-context switch
            // that loses that state, causing getRedirectResult() to return null.
            // Keep auth helper pages fully non-isolated.
            res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
            res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          }

          next();
        });
      },
    },
  ],
  worker: {
    // We use a classic Worker (not module) so the worker can load heavy libs via importScripts
    // from /public/scripts/*. Classic workers need an IIFE output format.
    format: 'iife',
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // pdfjs-dist is ESM and generally works fine, but some setups
    // benefit from explicit pre-bundling.
    include: ['pdfjs-dist'],
  },
});
