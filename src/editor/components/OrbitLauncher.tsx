import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../app/logo';

function Icon(props: { children: React.ReactNode; size?: number }) {
  const size = props.size ?? 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

function IconFileText(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M7 3h7l3 3v15H7z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </Icon>
  );
}

function IconImage(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M8 14l2-2 3 3 2-2 3 3" />
      <path d="M9 10h.01" />
    </Icon>
  );
}

function IconType(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M6 6h12" />
      <path d="M12 6v14" />
      <path d="M9 20h6" />
    </Icon>
  );
}

function IconFileCode(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M7 3h7l3 3v15H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 14l-2 2 2 2" />
      <path d="M14 14l2 2-2 2" />
    </Icon>
  );
}

function IconCloud(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M7.5 18h9.2a3.3 3.3 0 0 0 .5-6.6 4.5 4.5 0 0 0-8.6-1.1A3.4 3.4 0 0 0 7.5 18z" />
    </Icon>
  );
}

function IconMerge(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M8 7v4a3 3 0 0 0 3 3h2" />
      <path d="M8 17v-4a3 3 0 0 1 3-3h2" />
      <path d="M14 9l2-2 2 2" />
      <path d="M14 15l2 2 2-2" />
    </Icon>
  );
}

function IconGoogleDrive(props: { size?: number }) {
  // Simple triangular Drive-like mark (not the official logo)
  return (
    <Icon size={props.size}>
      <path d="M8 18h8l4-7-4-7H8L4 11z" />
      <path d="M8 18l4-7 4 7" />
      <path d="M8 4l4 7-8 0" />
    </Icon>
  );
}

function IconPlus(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

function IconX(props: { size?: number }) {
  return (
    <Icon size={props.size}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icon>
  );
}

interface OrbitOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  x: number;
  y: number;
  hoverMenu?: string[];
}

export type OrbitLauncherProps = {
  open: boolean;
  onClose: () => void;
  onSelect?: (id: OrbitOption['id']) => void;
  busyOptionId?: OrbitOption['id'] | null;
  onDebugEvent?: (msg: string) => void;
};

const OrbitLauncher: React.FC<OrbitLauncherProps> = (props) => {
  const navigate = useNavigate();
  const describeTarget = (t: EventTarget | null) => {
    const el = t as any;
    const tag = String(el?.tagName ?? '');
    const cls = typeof el?.className === 'string'
      ? el.className
      : (typeof el?.className?.baseVal === 'string' ? el.className.baseVal : '');
    const id = typeof el?.id === 'string' ? el.id : '';
    const parts = [tag.toLowerCase() || 'unknown'];
    if (id) parts.push(`#${id}`);
    if (cls) parts.push(`.${String(cls).trim().replace(/\s+/g, '.')}`);

    try {
      const node = t as Element | null;
      if (node && typeof (node as any).closest === 'function') {
        const btn = node.closest('button') as HTMLButtonElement | null;
        const btnCls = btn && typeof btn.className === 'string' ? btn.className : '';
        if (btnCls) parts.push(`[btn=${btnCls.trim().split(/\s+/)[0]}]`);

        const optBtn = node.closest('button.orbitLauncherOption') as HTMLButtonElement | null;
        const optId = optBtn?.dataset?.optId;
        if (optId) parts.push(`[opt=${optId}]`);

        const inCenter = !!node.closest('.orbitLauncherCenter');
        if (inCenter) parts.push('[center]');
      }
    } catch {
      // ignore
    }

    return parts.join('');
  };

  const calcRadius = () => {
    if (typeof window === 'undefined') return 205;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const card = Math.min(540, minDim * 0.94);
    const optionSize = minDim <= 520 ? 76 : 86;
    const rimPadding = 18;
    const r = Math.floor(card / 2 - optionSize / 2 - rimPadding);
    return Math.max(120, Math.min(210, r));
  };

  // radius for the orbit (responsive)
  const [r, setR] = useState(calcRadius);

  useEffect(() => {
    const onResize = () => setR(calcRadius());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const base = [
    { id: 'pdf', label: 'PDF', icon: <IconFileText size={24} />, color: '#ef4444' },
    { id: 'img', label: 'IMAGE', icon: <IconImage size={24} />, color: '#8b5cf6' },
    { id: 'txt', label: 'DATA', icon: <IconType size={24} />, color: '#0ea5e9' },
    { id: 'docx', label: 'DOCS', icon: <IconFileCode size={24} />, color: '#3b82f6' },
    { id: 'gdrive', label: 'DRIVE', icon: <IconGoogleDrive size={24} />, color: '#22c55e' },
    { id: 'merge', label: 'MERGE', icon: <IconMerge size={24} />, color: '#f472b6' },
    { id: 'drive', label: 'MD/TXT', icon: <IconFileCode size={24} />, color: '#10b981' },
    { id: 'new', label: 'NEW', icon: <IconPlus size={24} />, color: '#fbbf24' },
  ] as const;

  const options: OrbitOption[] = useMemo(() => base.map((opt, i) => {
    // Start at top (-90deg) and distribute evenly.
    const angle = (-90 + (360 / base.length) * i) * (Math.PI / 180);
    const x = Math.round(Math.cos(angle) * r);
    const y = Math.round(Math.sin(angle) * r);

    const hoverMenu = opt.id === 'docx'
      ? ['docx', 'doc', 'odt', 'ods']
      : opt.id === 'txt'
        ? ['xlsx', 'csv', 'xls', 'epub']
        : opt.id === 'img'
          ? ['jpg', 'png', 'webp', 'avif']
          : opt.id === 'drive'
            ? ['md', 'txt']
          : undefined;
    return { ...opt, x, y, hoverMenu };
  }), [r]);

  if (!props.open) return null;

  return (
    <div
      className="orbitLauncherOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Open or create"
      onPointerDownCapture={(e) =>
        props.onDebugEvent?.(`orbit:pointerdown:overlay target=${describeTarget(e.target)}`)
      }
    >
      <div className="orbitLauncherStack">
        <div
          className="orbitLauncherCard"
          aria-label="Open options"
          onPointerDownCapture={(e) =>
            props.onDebugEvent?.(`orbit:pointerdown:card target=${describeTarget(e.target)}`)
          }
        >
          <button
            type="button"
            onClick={props.onClose}
            className="orbitLauncherCloseBtn"
            aria-label="Close"
          >
            <IconX size={20} />
          </button>

          <div
            className="orbitLauncherCenter"
            aria-hidden="true"
            style={{ pointerEvents: 'none' }}
            data-center="true"
          >
            <Logo className="orbitLauncherCenterLogo" showWordmark={true} style={{ pointerEvents: 'none' }} />
          </div>

          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="orbitLauncherOption"
              data-opt-id={opt.id}
              style={{
                ['--opt-x' as any]: `${opt.x}px`,
                ['--opt-y' as any]: `${opt.y}px`,
                ['--opt-color' as any]: opt.color,
              }}
              onPointerDownCapture={(e) =>
                props.onDebugEvent?.(
                  `orbit:pointerdown:option:${opt.id} target=${describeTarget(e.target)}`,
                )
              }
              onClick={() => {
                props.onDebugEvent?.(`orbit:click:option:${opt.id}`);
                props.onSelect?.(opt.id);
              }}
              aria-label={opt.label}
              aria-busy={props.busyOptionId === opt.id}
            >
              {opt.hoverMenu?.length ? (
                <div
                  className="orbitLauncherOptionMenu"
                  aria-hidden="true"
                  onMouseDown={(e) => {
                    // Prevent the parent button from losing focus / re-triggering click.
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onPointerDownCapture={() => props.onDebugEvent?.(`orbit:pointerdown:menu:${opt.id}`)}
                >
                  {opt.hoverMenu.map((t) => (
                    <span
                      key={t}
                      className="orbitLauncherOptionMenuItem"
                      role="button"
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onPointerDownCapture={() => props.onDebugEvent?.(`orbit:pointerdown:chip:${opt.id}:${t}`)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Treat the hover "chips" as shortcuts to the parent option.
                        // This avoids a confusing "nothing happens" when users click them.
                        props.onDebugEvent?.(`orbit:click:chip:${opt.id}:${t}`);
                        props.onSelect?.(opt.id);
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="orbitLauncherOptionIcon" style={{ color: opt.color }}>
                {opt.icon}
                {props.busyOptionId === opt.id ? (
                  <span className="orbitLauncherBusySpinner" aria-hidden="true" />
                ) : null}
              </div>
              <span className="orbitLauncherOptionLabel">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="orbitLauncherBottomRow" role="presentation">
          <button
            type="button"
            className="orbitLauncherFeaturesBtn"
            onClick={() => {
              props.onDebugEvent?.('orbit:click:features');
              navigate('/features');
              props.onClose();
            }}
            aria-label="Check features"
          >
            <span className="orbitLauncherFeaturesText">Check features</span>
          </button>

          <button
            type="button"
            className="orbitLauncherPremiumBtn"
            onClick={() => {
              props.onDebugEvent?.('orbit:click:premium');
              navigate('/pw');
              props.onClose();
            }}
            aria-label="Premium"
          >
            <span className="orbitLauncherPremiumGlow" aria-hidden="true" />
            <span className="orbitLauncherPremiumShine" aria-hidden="true" />
            <span className="orbitLauncherPremiumText">Premium</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrbitLauncher;
