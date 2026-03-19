import type { ListObj, ListType } from '../state/types';
import { isOrderedListType } from '../util/listMarkers';
import { FontPicker } from './FontPicker';

type Align = 'left' | 'center' | 'right';

export type ListStylePatch = {
  font?: {
    family?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
  };
  color?: string;
  strike?: boolean;
  align?: Align;
  lineHeight?: number;

  listType?: ListType;
  startNumber?: number;
  indentSize?: number;

  // For Phase 1 indent controls.
  items?: ListObj['items'];
};

export function ListToolbar(props: {
  obj: ListObj;
  onPatch: (patch: ListStylePatch) => void;
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

  const listType = props.obj.listType ?? 'bullet';
  const startNumber = Math.max(1, Number(props.obj.startNumber ?? 1) || 1);
  const indentSize = Math.max(0, Number(props.obj.indentSize ?? 18) || 18);

  const showStart = isOrderedListType(listType as ListType);

  const indentAll = (delta: 1 | -1) => {
    const next = (props.obj.items ?? []).map((it) => ({
      ...it,
      indentLevel: Math.max(0, (Number(it.indentLevel) || 0) + delta),
    }));
    props.onPatch({ items: next });
  };

  return (
    <div className="textToolbar" data-list-toolbar>
      <label className="ttItem">
        <span className="muted">List</span>
        <select
          value={listType}
          onChange={(e) => props.onPatch({ listType: e.target.value as any })}
        >
          <optgroup label="Unordered">
            <option value="bullet">Bullet (•)</option>
            <option value="filled-circle">Filled circle (●)</option>
            <option value="hollow-circle">Hollow circle (○)</option>
            <option value="circle">Circle (◦)</option>
            <option value="square">Square (▪)</option>
            <option value="dash">Dash (–)</option>
          </optgroup>
          <optgroup label="Ordered">
            <option value="number">Number (1.)</option>
            <option value="upper-alpha">Alpha (A.)</option>
            <option value="lower-alpha">Alpha (a.)</option>
            <option value="upper-roman">Roman (I.)</option>
            <option value="lower-roman">Roman (i.)</option>
          </optgroup>
          <optgroup label="Task">
            <option value="checkbox">Checkbox</option>
          </optgroup>
        </select>
      </label>

      {showStart ? (
        <label className="ttItem">
          <span className="muted">Start</span>
          <input
            type="number"
            min={1}
            max={999}
            value={startNumber}
            onChange={(e) =>
              props.onPatch({ startNumber: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })
            }
            style={{ width: 70 }}
          />
        </label>
      ) : null}

      <div className="ttGroup">
        <button type="button" onClick={() => indentAll(-1)}>
          Outdent
        </button>
        <button type="button" onClick={() => indentAll(1)}>
          Indent
        </button>
      </div>

      <label className="ttItem">
        <span className="muted">Indent</span>
        <input
          type="number"
          min={0}
          max={80}
          value={indentSize}
          onChange={(e) =>
            props.onPatch({ indentSize: Math.max(0, Math.min(80, Number(e.target.value) || 18)) })
          }
          style={{ width: 70 }}
        />
      </label>

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
        <input type="color" value={color} onChange={(e) => props.onPatch({ color: e.target.value })} />
      </label>

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
            props.onPatch({ lineHeight: Math.max(1, Math.min(2.5, Number(e.target.value) || 1.3)) })
          }
          style={{ width: 70 }}
        />
      </label>

      {/* TODO Phase 2: indent selected line based on caret mapping. */}
    </div>
  );
}
