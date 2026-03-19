# pdfstudio.tech

## Overview
pdfstudio.tech is a browser-based PDF editor and toolkit built for fast, private document workflows.
Most operations run fully on the client, with optional cloud integrations for sign-in and storage.

## Tech Stack
- React + TypeScript
- Vite
- Firebase (hosting/auth/config)
- PDF.js (rendering)
- QPDF (WASM) for PDF operations

## Features
- View and render PDFs in the browser
- Common editing tools (text, shapes, images, ink/highlight)
- Page operations: merge, split, rotate, reorder, extract, insert, crop
- Export updated PDFs (client-side)
- Optional Google Drive / Firebase auth flows

## Demo
- Live: (add link here)

## Development
- Install: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Architecture
```mermaid
flowchart LR
	U[User] -->|uploads PDF| UI[React UI]
	UI --> R[PDF Renderer (PDF.js)]
	UI --> E[Editor State + Tools]
	E --> W[Web Workers]
	W --> Q[QPDF (WASM)]
	Q --> OUT[Exported PDF]
	UI -->|optional| FB[Firebase Auth/Hosting]
	UI -->|optional| GD[Google Drive APIs]
```
