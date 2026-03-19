import type { ImageObj, ShapeMask } from '../state/types';

export function ImageMaskPicker(props: {
  selectedImageObj: ImageObj;
  currentMask: ShapeMask;
  onPatch: (patch: Partial<ImageObj>) => void;
}) {
  const setMask = (mask: ShapeMask) => props.onPatch({ mask } as any);

  const mask = props.currentMask;

  const is = (t: ShapeMask['type']) => mask?.type === t;

  const clampSides = (n: number) => Math.max(5, Math.min(12, Math.round(n)));

  return (
    <div className="maskPicker">
      <div className="maskTierRow">
        <button type="button" className={is('none') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'none' })}>
          Rect
        </button>
        <button
          type="button"
          className={is('rect') ? 'maskBtn active' : 'maskBtn'}
          onClick={() => setMask({ type: 'rect', radius: (mask.type === 'rect' ? mask.radius : 16) ?? 16 })}
        >
          Rounded Rect
        </button>
        <button type="button" className={is('circle') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'circle' })}>
          Circle
        </button>
        <button type="button" className={is('ellipse') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'ellipse' })}>
          Ellipse
        </button>
      </div>

      {mask.type === 'rect' ? (
        <div className="maskControls">
          <div className="propsRow" style={{ padding: 0 }}>
            <span className="muted">Radius</span>
            <div className="row gap">
              <span>{Math.round(mask.radius ?? 0)}</span>
              <button type="button" onClick={() => setMask({ type: 'rect', radius: 0 })}>Reset</button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={48}
            step={1}
            value={mask.radius ?? 0}
            onChange={(e) => setMask({ type: 'rect', radius: Number(e.target.value) })}
          />
        </div>
      ) : null}

      <div className="maskDivider" />

      <div className="maskTierRow">
        <button
          type="button"
          className={is('triangle') ? 'maskBtn active' : 'maskBtn'}
          onClick={() => setMask({ type: 'triangle', direction: 'up' })}
        >
          Triangle
        </button>
        <button type="button" className={is('diamond') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'diamond' })}>
          Diamond
        </button>
        <button type="button" className={is('hexagon') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'hexagon' })}>
          Hexagon
        </button>
        <button
          type="button"
          className={is('polygon') ? 'maskBtn active' : 'maskBtn'}
          onClick={() => setMask({ type: 'polygon', sides: mask.type === 'polygon' ? mask.sides : 5 })}
        >
          Polygon
        </button>

        {mask.type === 'polygon' ? (
          <div className="maskInline">
            <button
              type="button"
              className="maskMiniBtn"
              onClick={() => setMask({ type: 'polygon', sides: clampSides((mask.sides ?? 5) - 1) })}
            >
              -
            </button>
            <input
              className="maskSides"
              type="number"
              min={5}
              max={12}
              value={mask.sides ?? 5}
              onChange={(e) => setMask({ type: 'polygon', sides: clampSides(Number(e.target.value)) })}
            />
            <button
              type="button"
              className="maskMiniBtn"
              onClick={() => setMask({ type: 'polygon', sides: clampSides((mask.sides ?? 5) + 1) })}
            >
              +
            </button>
          </div>
        ) : null}
      </div>

      <div className="maskDivider" />

      <div className="maskTierRow">
        <button
          type="button"
          className={is('star') ? 'maskBtn active' : 'maskBtn'}
          onClick={() => setMask({ type: 'star', points: 5, innerRatio: 0.5 })}
        >
          Star
        </button>
        <button
          type="button"
          className={is('bubble') ? 'maskBtn active' : 'maskBtn'}
          onClick={() => setMask({ type: 'bubble', tail: 'bottom' })}
        >
          Speech Bubble
        </button>
        <button type="button" className={is('heart') ? 'maskBtn active' : 'maskBtn'} onClick={() => setMask({ type: 'heart' })}>
          Heart
        </button>
      </div>
    </div>
  );
}
