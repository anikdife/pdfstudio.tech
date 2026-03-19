import React from 'react';

export function Logo(
  props: React.SVGProps<SVGSVGElement> & {
    showWordmark?: boolean;
  },
) {
  const { showWordmark = true, ...svgProps } = props;

  // Icon content fits roughly within 0..360 on Y; full lockup uses 0..450.
  const viewBox = showWordmark ? '0 0 500 450' : '0 0 500 360';
  const height = showWordmark ? 450 : 360;

  return (
    <svg
      viewBox={viewBox}
      width="500"
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...svgProps}
    >
      <defs>
        <linearGradient id="gradTop" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#29E7FF" />
          <stop offset="100%" stopColor="#00B4D8" />
        </linearGradient>

        <linearGradient id="gradFold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0077B6" />
          <stop offset="100%" stopColor="#023E8A" />
        </linearGradient>

        <linearGradient id="gradBottom" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#03045E" />
          <stop offset="50%" stopColor="#0077B6" />
          <stop offset="100%" stopColor="#00B4D8" />
        </linearGradient>

        <filter id="softShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
          <feOffset dx="0" dy="10" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#softShadow)">
        <path d="M180 80 L140 280 L180 330 L220 230 Z" fill="url(#gradFold)" />

        <path
          d="M180 80 L320 80 C380 80 380 180 320 180 L200 180 L180 80"
          fill="url(#gradTop)"
        />

        <path
          d="M320 120 C340 120 340 160 320 160 L280 160 C300 150 300 130 280 120 Z"
          fill="#03045E"
          opacity="0.6"
        />

        <path d="M180 330 L160 280 L380 280 L360 305 L380 330 Z" fill="url(#gradBottom)" />
      </g>

      {showWordmark ? (
        <text
          x="250"
          y="420"
          textAnchor="middle"
          fontFamily="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
          fontWeight="700"
          fontSize="52"
        >
          <tspan fill="#1E3A8A">pdfstudio</tspan>
          <tspan fill="#00DFFF">.tech</tspan>
        </text>
      ) : null}
    </svg>
  );
}
