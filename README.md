# PDF Studio

> A modern browser-based PDF editor with local-first editing and optional cloud integration.

<p align="center">
  <img src="./public/og-image.png" alt="PDF Studio banner" width="100%" />
</p>

<p align="center">
  <a href="https://pdfstudio.tech"><img alt="Live Demo" src="https://img.shields.io/badge/demo-live-success"></a>
  <img alt="Vite" src="https://img.shields.io/badge/vite-fast-purple">
  <img alt="React" src="https://img.shields.io/badge/react-frontend-blue">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-strict-3178c6">
  <img alt="License" src="https://img.shields.io/github/license/YOUR_USERNAME/YOUR_REPO">
  <img alt="Issues" src="https://img.shields.io/github/issues/YOUR_USERNAME/YOUR_REPO">
</p>

## Overview

PDF Studio is a privacy-first PDF editing application designed for fast in-browser document workflows. It focuses on practical editing operations such as page reordering, cropping, rotating, splitting, extracting, and merging, while supporting optional cloud-connected workflows.

## Why this project exists

Most PDF tools are either:
- too limited,
- too expensive,
- too slow for everyday page operations,
- or too dependent on full document upload workflows.

PDF Studio is built to provide:
- fast visual editing,
- local-first interaction,
- clean modern UX,
- optional cloud integration for authenticated users.

## Core Features

- Import local PDF files in the browser
- Create new blank PDFs
- Page thumbnail navigation
- Multi-page selection with Ctrl/Cmd/Shift
- Drag-and-drop page reordering
- Rotate pages
- Delete selected pages
- Crop mode with apply/reset
- Merge PDFs
- Multi-file merge
- Split by ranges
- Extract selected pages
- Export transformed documents
- Optional Firebase authentication
- Optional Google Drive-connected workflows

## Screenshots

### Home
![Home](./public/demo/editor-home.png)

### Thumbnails and Page Selection
![Thumbnails](./public/demo/thumbnails-panel.png)

### Crop Mode
![Crop Mode](./public/demo/crop-mode.png)

### Merge and Split
![Merge and Split](./public/demo/merge-split.png)

## Tech Stack

- React
- TypeScript
- Vite
- Zustand
- pdf.js
- pdf-lib
- Firebase Authentication
- Firestore
- Google Drive OAuth integration

## Local Development

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
