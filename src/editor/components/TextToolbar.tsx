import type { TextObj } from '../state/types';
import { FontPicker } from './FontPicker';

type Align = 'left' | 'center' | 'right';
type BorderStyle =
  | 'dotted'
  | 'dashed'
  | 'solid'
  | 'double'
  | 'groove'
  | 'ridge'
  | 'inset'
  | 'outset'
  | 'none';

export type TextStylePatch = {
  font?: {
    family?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
  };
  color?: string;
  background?: string;
  border?: {
    color?: string;
    width?: number;
    style?: BorderStyle;
  };
  strike?: boolean;
  align?: Align;
  lineHeight?: number;
};

export function TextToolbar(props: {
  obj: TextObj;
  onPatch: (patch: TextStylePatch) => void;
}) {
  const font = props.obj.font ?? {
    family: 'Helvetica',
    size: props.obj.fontSize ?? 16,
    bold: false,
    italic: false,
  };

  const align: Align = props.obj.align ?? 'left';
  const lineHeight = props.obj.lineHeight ?? 1.3;
  const strike = props.obj.strike ?? false;
  const color = props.obj.color ?? '#111111';

  const background = props.obj.background ?? 'transparent';
  const border = props.obj.border ?? { color: '#e5e5e5', width: 0, style: 'none' as BorderStyle };
  const borderStyle: BorderStyle = (border.style ?? 'none') as BorderStyle;
  const borderWidth = Math.max(0, Math.min(20, Number(border.width ?? 0)));
  const borderColor = border.color ?? '#e5e5e5';

  return (
    <div className="textToolbar" data-text-toolbar>
      <label className="ttItem">
        <span className="muted">Font</span>
        <FontPicker
          value={font.family}
          onSelect={(fontId) => props.onPatch({ font: { ...font, family: fontId } })}
        />
      </label>

      <label className="ttItem">
        <span className="muted">Size</span>
        <input
          type="number"
          min={6}
          max={96}
          value={font.size}
          onChange={(e) =>
            props.onPatch({
              font: { ...font, size: Math.max(6, Math.min(96, Number(e.target.value) || 16)) },
            })
          }
          style={{ width: 70 }}
        />
      </label>

      <label className="ttItem">
        <span className="muted">Color</span>
        <input
          type="color"
          value={color}
          onChange={(e) => props.onPatch({ color: e.target.value })}
        />
      </label>

      <label className="ttItem">
        <span className="muted">Bg</span>
        <input
          type="color"
          value={background === 'transparent' ? '#ffffff' : background}
          onChange={(e) => props.onPatch({ background: e.target.value })}
        />
      </label>
      <button type="button" onClick={() => props.onPatch({ background: 'transparent' })}>
        No Bg
      </button>

      <div className="ttGroup">
        <span className="muted" style={{ fontSize: 12 }}>
          Border
        </span>
        <select
          value={borderStyle}
          onChange={(e) => props.onPatch({ border: { ...border, style: e.target.value as BorderStyle } })}
        >
          <option value="none">None</option>
          <option value="dotted">Dotted</option>
          <option value="dashed">Dashed</option>
          <option value="solid">Solid</option>
          <option value="double">Double</option>
          <option value="groove">Groove</option>
          <option value="ridge">Ridge</option>
          <option value="inset">Inset</option>
          <option value="outset">Outset</option>
        </select>
        <input
          type="number"
          min={0}
          max={20}
          value={borderWidth}
          onChange={(e) =>
            props.onPatch({
              border: { ...border, width: Math.max(0, Math.min(20, Number(e.target.value) || 0)) },
            })
          }
          style={{ width: 64 }}
        />
        <input
          type="color"
          value={borderColor}
          onChange={(e) => props.onPatch({ border: { ...border, color: e.target.value } })}
        />
        <button type="button" onClick={() => props.onPatch({ border: { ...border, style: 'none', width: 0 } })}>
          Off
        </button>
      </div>

      <div className="ttGroup">
        <button
          type="button"
          className={font.bold ? 'active' : ''}
          onClick={() => props.onPatch({ font: { ...font, bold: !font.bold } })}
        >
          B
        </button>
        <button
          type="button"
          className={font.italic ? 'active' : ''}
          onClick={() => props.onPatch({ font: { ...font, italic: !font.italic } })}
        >
          I
        </button>
        <button
          type="button"
          className={strike ? 'active' : ''}
          onClick={() => props.onPatch({ strike: !strike })}
        >
          S
        </button>
      </div>

      <div className="ttGroup">
        <button
          type="button"
          className={align === 'left' ? 'active' : ''}
          onClick={() => props.onPatch({ align: 'left' })}
        >
          L
        </button>
        <button
          type="button"
          className={align === 'center' ? 'active' : ''}
          onClick={() => props.onPatch({ align: 'center' })}
        >
          C
        </button>
        <button
          type="button"
          className={align === 'right' ? 'active' : ''}
          onClick={() => props.onPatch({ align: 'right' })}
        >
          R
        </button>
      </div>

      <label className="ttItem">
        <span className="muted">Line</span>
        <input
          type="number"
          min={1}
          max={2.5}
          step={0.1}
          value={lineHeight}
          onChange={(e) =>
            props.onPatch({
              lineHeight: Math.max(1, Math.min(2.5, Number(e.target.value) || 1.3)),
            })
          }
          style={{ width: 70 }}
        />
      </label>
    </div>
  );
}
