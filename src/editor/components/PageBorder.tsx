import React from 'react';

type BorderStyle =
  | 'corporate'
  | 'modern-accent'
  | 'classic-frame'
  | 'minimalist'
  | 'ornate-corners'
  | 'floral-spectrum'
  | 'vintage-banner'
  | 'gold-frame'
  | 'doodle'
  | 'wave';

interface PageBorderProps {
  style: BorderStyle;
  color?: string;
  strokeWidth?: number;
  width?: number; // Represented in PDF points or pixels
  height?: number;
}

const PageBorder: React.FC<PageBorderProps> = ({
  style,
  color = '#2c3e50',
  strokeWidth = 2,
  width = 595, // Default A4 Width
  height = 842, // Default A4 Height
}) => {
  const padding = 20; // Margin from page edge

  const renderBorderStyle = () => {
    switch (style) {
      case 'corporate':
        // Double line border with thick outer and thin inner
        return (
          <g>
            <rect
              x={padding}
              y={padding}
              width={width - padding * 2}
              height={height - padding * 2}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth * 2}
            />
            <rect
              x={padding + 5}
              y={padding + 5}
              width={width - padding * 2 - 10}
              height={height - padding * 2 - 10}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth / 2}
            />
          </g>
        );

      case 'modern-accent': {
        // L-shaped corner accents (popular for presentations)
        const len = 40;
        return (
          <g stroke={color} strokeWidth={strokeWidth * 1.5} fill="none">
            {/* Top Left */}
            <path d={`M${padding},${padding + len} V${padding} H${padding + len}`} />
            {/* Top Right */}
            <path d={`M${width - padding - len},${padding} H${width - padding} V${padding + len}`} />
            {/* Bottom Left */}
            <path d={`M${padding},${height - padding - len} V${height - padding} H${padding + len}`} />
            {/* Bottom Right */}
            <path d={`M${width - padding - len},${height - padding} H${width - padding} V${height - padding - len}`} />
          </g>
        );
      }

      case 'classic-frame': {
        // Inset border with "notched" corners for a certificate/professional look
        const notch = 15;
        return (
          <path
            d={`
              M ${padding + notch} ${padding} 
              H ${width - padding - notch} 
              L ${width - padding} ${padding + notch} 
              V ${height - padding - notch} 
              L ${width - padding - notch} ${height - padding} 
              H ${padding + notch} 
              L ${padding} ${height - padding - notch} 
              V ${padding + notch} Z
            `}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
          />
        );
      }

      case 'minimalist':
        // Single thin line with small circles at the corners
        return (
          <g>
            <rect
              x={padding}
              y={padding}
              width={width - padding * 2}
              height={height - padding * 2}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth / 2}
              strokeDasharray="4 2"
            />
            <circle cx={padding} cy={padding} r="3" fill={color} />
            <circle cx={width - padding} cy={padding} r="3" fill={color} />
            <circle cx={padding} cy={height - padding} r="3" fill={color} />
            <circle cx={width - padding} cy={height - padding} r="3" fill={color} />
          </g>
        );

      case 'ornate-corners': {
        const x0 = padding;
        const y0 = padding;
        const x1 = width - padding;
        const y1 = height - padding;
        const inset = 10;
        const curl = 24;

        return (
          <g fill="none" stroke={color} strokeWidth={Math.max(1, strokeWidth)}>
            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              rx="2"
            />
            <rect
              x={x0 + inset}
              y={y0 + inset}
              width={x1 - x0 - inset * 2}
              height={y1 - y0 - inset * 2}
              rx="2"
              opacity="0.55"
              strokeWidth={Math.max(1, strokeWidth / 2)}
            />

            {/* Corner curls (simple flourishes) */}
            <path
              d={`M${x0 + 10},${y0 + curl} C${x0 + 10},${y0 + 10} ${x0 + curl},${y0 + 10} ${x0 + curl},${y0 + 10}`}
              strokeWidth={Math.max(1, strokeWidth * 0.9)}
            />
            <path
              d={`M${x0 + curl},${y0 + 10} C${x0 + curl + 14},${y0 + 10} ${x0 + curl + 14},${y0 + 24} ${x0 + 12},${y0 + 24}`}
              strokeWidth={Math.max(1, strokeWidth * 0.7)}
              opacity="0.8"
            />

            <path
              d={`M${x1 - 10},${y0 + curl} C${x1 - 10},${y0 + 10} ${x1 - curl},${y0 + 10} ${x1 - curl},${y0 + 10}`}
              strokeWidth={Math.max(1, strokeWidth * 0.9)}
            />
            <path
              d={`M${x1 - curl},${y0 + 10} C${x1 - curl - 14},${y0 + 10} ${x1 - curl - 14},${y0 + 24} ${x1 - 12},${y0 + 24}`}
              strokeWidth={Math.max(1, strokeWidth * 0.7)}
              opacity="0.8"
            />

            <path
              d={`M${x0 + 10},${y1 - curl} C${x0 + 10},${y1 - 10} ${x0 + curl},${y1 - 10} ${x0 + curl},${y1 - 10}`}
              strokeWidth={Math.max(1, strokeWidth * 0.9)}
            />
            <path
              d={`M${x0 + curl},${y1 - 10} C${x0 + curl + 14},${y1 - 10} ${x0 + curl + 14},${y1 - 24} ${x0 + 12},${y1 - 24}`}
              strokeWidth={Math.max(1, strokeWidth * 0.7)}
              opacity="0.8"
            />

            <path
              d={`M${x1 - 10},${y1 - curl} C${x1 - 10},${y1 - 10} ${x1 - curl},${y1 - 10} ${x1 - curl},${y1 - 10}`}
              strokeWidth={Math.max(1, strokeWidth * 0.9)}
            />
            <path
              d={`M${x1 - curl},${y1 - 10} C${x1 - curl - 14},${y1 - 10} ${x1 - curl - 14},${y1 - 24} ${x1 - 12},${y1 - 24}`}
              strokeWidth={Math.max(1, strokeWidth * 0.7)}
              opacity="0.8"
            />
          </g>
        );
      }

      case 'floral-spectrum': {
        const x0 = padding;
        const y0 = padding;
        const x1 = width - padding;
        const y1 = height - padding;
        const r = 10;

        return (
          <g>
            <defs>
              <linearGradient id="pb-spectrum" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#13b0ff" />
                <stop offset="45%" stopColor="#6f4cff" />
                <stop offset="100%" stopColor="#ff3bb6" />
              </linearGradient>
            </defs>

            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              rx="3"
              fill="none"
              stroke="url(#pb-spectrum)"
              strokeWidth={Math.max(1, strokeWidth * 1.2)}
            />

            {/* Simple petals in corners (original, abstract) */}
            <g fill="url(#pb-spectrum)" opacity="0.9">
              <path d={`M${x0 + r},${y0 + 2} C${x0 + 2},${y0 + 2} ${x0 + 2},${y0 + r} ${x0 + r},${y0 + r} C${x0 + r * 1.4},${y0 + r} ${x0 + r * 1.4},${y0 + 2} ${x0 + r},${y0 + 2} Z`} />
              <path d={`M${x1 - r},${y0 + 2} C${x1 - 2},${y0 + 2} ${x1 - 2},${y0 + r} ${x1 - r},${y0 + r} C${x1 - r * 1.4},${y0 + r} ${x1 - r * 1.4},${y0 + 2} ${x1 - r},${y0 + 2} Z`} />
              <path d={`M${x0 + r},${y1 - 2} C${x0 + 2},${y1 - 2} ${x0 + 2},${y1 - r} ${x0 + r},${y1 - r} C${x0 + r * 1.4},${y1 - r} ${x0 + r * 1.4},${y1 - 2} ${x0 + r},${y1 - 2} Z`} />
              <path d={`M${x1 - r},${y1 - 2} C${x1 - 2},${y1 - 2} ${x1 - 2},${y1 - r} ${x1 - r},${y1 - r} C${x1 - r * 1.4},${y1 - r} ${x1 - r * 1.4},${y1 - 2} ${x1 - r},${y1 - 2} Z`} />
            </g>
          </g>
        );
      }

      case 'vintage-banner': {
        const x0 = padding;
        const y0 = padding;
        const x1 = width - padding;
        const y1 = height - padding;
        const bannerW = Math.min(240, (x1 - x0) * 0.45);
        const bannerX = (width - bannerW) / 2;
        const bannerY = y0 + 22;

        return (
          <g fill="none" stroke={color}>
            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              rx="3"
              strokeWidth={Math.max(1, strokeWidth * 0.9)}
              opacity="0.65"
            />

            {/* leafy side vines */}
            <path
              d={`M${x0 + 18},${y0 + 70} C${x0 + 36},${y0 + 120} ${x0 + 20},${y0 + 160} ${x0 + 36},${y0 + 220} C${x0 + 48},${y0 + 270} ${x0 + 26},${y0 + 310} ${x0 + 44},${y0 + 360}`}
              strokeWidth={Math.max(1, strokeWidth)}
              opacity="0.9"
            />
            <path
              d={`M${x1 - 18},${y0 + 70} C${x1 - 36},${y0 + 120} ${x1 - 20},${y0 + 160} ${x1 - 36},${y0 + 220} C${x1 - 48},${y0 + 270} ${x1 - 26},${y0 + 310} ${x1 - 44},${y0 + 360}`}
              strokeWidth={Math.max(1, strokeWidth)}
              opacity="0.9"
            />

            {/* small leaves */}
            <g fill={color} opacity="0.45">
              {Array.from({ length: 10 }, (_, i) => (
                <circle
                  key={i}
                  cx={x0 + 26 + (i % 2) * 10}
                  cy={y0 + 90 + i * 28}
                  r="2"
                />
              ))}
              {Array.from({ length: 10 }, (_, i) => (
                <circle
                  key={i}
                  cx={x1 - 26 - (i % 2) * 10}
                  cy={y0 + 90 + i * 28}
                  r="2"
                />
              ))}
            </g>

            {/* banner */}
            <path
              d={`M${bannerX},${bannerY + 12} Q${bannerX + bannerW / 2},${bannerY - 10} ${bannerX + bannerW},${bannerY + 12} L${bannerX + bannerW - 18},${bannerY + 28} Q${bannerX + bannerW / 2},${bannerY + 44} ${bannerX + 18},${bannerY + 28} Z`}
              strokeWidth={Math.max(1, strokeWidth)}
              fill="rgba(255,255,255,0)"
            />
          </g>
        );
      }

      case 'gold-frame': {
        const x0 = padding;
        const y0 = padding;
        const x1 = width - padding;
        const y1 = height - padding;
        const inset = 10;
        return (
          <g>
            <defs>
              <linearGradient id="pb-gold" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8a6f1c" />
                <stop offset="35%" stopColor="#f4d77a" />
                <stop offset="60%" stopColor="#caa13a" />
                <stop offset="100%" stopColor="#8a6f1c" />
              </linearGradient>
            </defs>

            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              rx="2"
              fill="none"
              stroke="url(#pb-gold)"
              strokeWidth={Math.max(2, strokeWidth * 2)}
            />
            <rect
              x={x0 + inset}
              y={y0 + inset}
              width={x1 - x0 - inset * 2}
              height={y1 - y0 - inset * 2}
              rx="2"
              fill="none"
              stroke="url(#pb-gold)"
              strokeWidth={Math.max(1, strokeWidth)}
              opacity="0.9"
            />

            {/* small corner cuts */}
            <g stroke="url(#pb-gold)" strokeWidth={Math.max(1, strokeWidth)} opacity="0.9">
              <path d={`M${x0 + 10},${y0 + 30} L${x0 + 30},${y0 + 10}`} />
              <path d={`M${x1 - 10},${y0 + 30} L${x1 - 30},${y0 + 10}`} />
              <path d={`M${x0 + 10},${y1 - 30} L${x0 + 30},${y1 - 10}`} />
              <path d={`M${x1 - 10},${y1 - 30} L${x1 - 30},${y1 - 10}`} />
            </g>
          </g>
        );
      }

      case 'doodle': {
        const x0 = padding;
        const y0 = padding;
        const x1 = width - padding;
        const y1 = height - padding;
        const stroke = Math.max(1, strokeWidth * 0.9);
        return (
          <g fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
            <rect
              x={x0}
              y={y0}
              width={x1 - x0}
              height={y1 - y0}
              rx="3"
              strokeDasharray="6 4"
            />

            {/* doodle icons */}
            <path d={`M${x0 + 40},${y0 + 18} l4,8 l-8,-4 l8,-4 l-8,4 z`} />
            <path d={`M${x1 - 60},${y0 + 22} q12,-10 24,0 q-12,10 -24,0 z`} />
            <path d={`M${x0 + 24},${y1 - 24} q10,-14 20,0 q-10,14 -20,0 z`} />
            <path d={`M${x1 - 52},${y1 - 18} l10,0 m-5,-5 l5,5 l-5,5`} />

            {/* tiny stars */}
            <path d={`M${x0 + 18},${y0 + 40} l2,6 l6,2 l-6,2 l-2,6 l-2,-6 l-6,-2 l6,-2 z`} />
            <path d={`M${x1 - 18},${y1 - 44} l2,6 l6,2 l-6,2 l-2,6 l-2,-6 l-6,-2 l6,-2 z`} />
          </g>
        );
      }

      case 'wave': {
        const band = Math.max(38, Math.min(80, height * 0.12));
        return (
          <g>
            <defs>
              <linearGradient id="pb-wave" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0b1a3a" />
                <stop offset="50%" stopColor="#2d4a86" />
                <stop offset="100%" stopColor="#0b1a3a" />
              </linearGradient>
            </defs>

            <path
              d={`M 0 ${band} C ${width * 0.22} ${band - 18}, ${width * 0.44} ${band + 18}, ${width * 0.66} ${band} C ${width * 0.82} ${band - 14}, ${width * 0.92} ${band + 14}, ${width} ${band} L ${width} 0 L 0 0 Z`}
              fill="url(#pb-wave)"
              opacity="0.92"
            />
            <path
              d={`M 0 ${height - band} C ${width * 0.22} ${height - band + 18}, ${width * 0.44} ${height - band - 18}, ${width * 0.66} ${height - band} C ${width * 0.82} ${height - band + 14}, ${width * 0.92} ${height - band - 14}, ${width} ${height - band} L ${width} ${height} L 0 ${height} Z`}
              fill="url(#pb-wave)"
              opacity="0.92"
            />

            <rect
              x={padding}
              y={padding}
              width={width - padding * 2}
              height={height - padding * 2}
              rx="3"
              fill="none"
              stroke={color}
              opacity="0.25"
              strokeWidth={Math.max(1, strokeWidth * 0.8)}
            />
          </g>
        );
      }
    }
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      {renderBorderStyle()}
    </svg>
  );
};

export default PageBorder;
