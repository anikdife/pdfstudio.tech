import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

function svgStringToDataUrl(svg: string): string {
  // Encode as URI (not base64) for better caching + readability.
  // Keep it conservative for broad browser compatibility.
  const encoded = encodeURIComponent(svg)
    .replace(/%0A/g, '')
    .replace(/%20/g, ' ');
  return `data:image/svg+xml,${encoded}`;
}

export function setFavicon(href: string, type: string = 'image/svg+xml') {
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  let link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
  }

  link.type = type;
  // Helps some browsers choose the right icon representation.
  // For SVG, `any` is the recommended value.
  link.sizes = type === 'image/svg+xml' ? 'any' : '';
  link.href = href;
}

export function setFaviconFromSvgReactElement(element: React.ReactElement) {
  const svg = renderToStaticMarkup(element);
  const href = svgStringToDataUrl(svg);
  setFavicon(href);
}
