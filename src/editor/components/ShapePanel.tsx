import { useMemo } from 'react';
import { useDocumentStore } from '../state/documentStore';
import { useUiStore } from '../state/uiStore';
import type { ShapeObj, ShapeType } from '../state/types';

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 16H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 9h11v11H9z" />
      <path d="M4 15H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

type ShapeGalleryItem = {
  group: string;
  label: string;
  shapeType: ShapeType;
  disabled?: boolean;
  variant?: string;
};

const GALLERY: ShapeGalleryItem[] = [
  { group: 'Basic', label: 'Rect', shapeType: 'rect' },
  { group: 'Basic', label: 'Rounded rect', shapeType: 'roundRect' },
  { group: 'Basic', label: 'Circle', shapeType: 'circle' },
  { group: 'Basic', label: 'Ellipse', shapeType: 'ellipse' },
  { group: 'Basic', label: 'Triangle', shapeType: 'triangle' },
  { group: 'Basic', label: 'Polygon', shapeType: 'polygon' },
  { group: 'Basic', label: 'Star', shapeType: 'star' },

  { group: 'Arrows & connectors', label: 'Line', shapeType: 'line' },
  { group: 'Arrows & connectors', label: 'Arrow', shapeType: 'arrow' },
  { group: 'Arrows & connectors', label: 'Double-arrow', shapeType: 'doubleArrow' },
  { group: 'Arrows & connectors', label: 'Curved arrow (later)', shapeType: 'curvedArrow', disabled: true },
  { group: 'Arrows & connectors', label: 'Connector', shapeType: 'connector' },

  { group: 'Flowchart essentials', label: 'Process', shapeType: 'process' },
  { group: 'Flowchart essentials', label: 'Decision', shapeType: 'decision' },
  { group: 'Flowchart essentials', label: 'Terminator', shapeType: 'terminator' },
  { group: 'Flowchart essentials', label: 'Document', shapeType: 'document' },
  { group: 'Flowchart essentials', label: 'Database', shapeType: 'database' },
  { group: 'Flowchart essentials', label: 'Input/Output', shapeType: 'inputOutput' },

  { group: 'Callouts', label: 'Speech bubble (tail up)', shapeType: 'speechBubble', variant: 'tail-up' },
  { group: 'Callouts', label: 'Speech bubble (tail down)', shapeType: 'speechBubble', variant: 'tail-down' },
  { group: 'Callouts', label: 'Speech bubble (tail left)', shapeType: 'speechBubble', variant: 'tail-left' },
  { group: 'Callouts', label: 'Speech bubble (tail right)', shapeType: 'speechBubble', variant: 'tail-right' },
  { group: 'Callouts', label: 'Label tag', shapeType: 'labelTag' },
  { group: 'Callouts', label: 'Pointer callout', shapeType: 'pointerCallout' },

  { group: 'Badges', label: 'Ribbon', shapeType: 'ribbon' },
  { group: 'Badges', label: 'Seal', shapeType: 'seal' },
  { group: 'Badges', label: 'Banner', shapeType: 'banner' },
];

function shortId(id: string) {
  const s = String(id ?? '');
  return s.length <= 6 ? s : s.slice(-6);
}

export function ShapePanel() {
  const activePageIndex = useDocumentStore((s) => s.activePageIndex);
  const doc = useDocumentStore((s) => s.doc);

  const selectedShapeId = useUiStore((s) => s.selectedShapeId);
  const setSelectedShapeId = useUiStore((s) => s.setSelectedShapeId);

  const placementShapeType = useUiStore((s) => s.placementShapeType);
  const placementShapeVariant = useUiStore((s) => s.placementShapeVariant);
  const setPlacementShapeType = useUiStore((s) => s.setPlacementShapeType);
  const setPlacementShapeVariant = useUiStore((s) => s.setPlacementShapeVariant);

  const patchShape = useDocumentStore((s) => s.patchShape);
  const removeShape = useDocumentStore((s) => s.removeShape);
  const reorderShapeLayer = useDocumentStore((s) => s.reorderShapeLayer);
  const duplicateOverlayObject = useDocumentStore((s) => s.duplicateOverlayObject);

  const shapesOnPage = useMemo(() => {
    if (!doc) return [] as ShapeObj[];
    const objects = doc.overlays[activePageIndex]?.objects ?? [];
    return objects.filter((o) => o.type === 'shape') as ShapeObj[];
  }, [doc, activePageIndex]);

  const selectedShape = useMemo(() => {
    if (!selectedShapeId) return null;
    return shapesOnPage.find((s) => s.id === selectedShapeId) ?? null;
  }, [selectedShapeId, shapesOnPage]);

  const groups = useMemo(() => {
    const map = new Map<string, ShapeGalleryItem[]>();
    for (const item of GALLERY) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 8,
      }}
    >
      {/* SECTION A */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
        <div className="propsRow">
          <div className="muted">Shape Library</div>
          <div className="muted">{placementShapeType ?? ''}</div>
        </div>

        <div style={{ padding: 10, display: 'grid', gap: 10 }}>
          {groups.map(([groupName, items]) => (
            <div key={groupName}>
              <div className="muted" style={{ padding: '6px 0' }}>{groupName}</div>
              <div className="row gap" style={{ flexWrap: 'wrap' }}>
                {items.map((it) => {
                  const isActive =
                    placementShapeType === it.shapeType &&
                    (it.variant ? placementShapeVariant === it.variant : !placementShapeVariant);
                  return (
                    <button
                      key={`${it.group}:${it.label}`}
                      type="button"
                      className={isActive ? 'active' : undefined}
                      aria-pressed={isActive}
                      disabled={Boolean(it.disabled)}
                      onClick={() => {
                        if (it.disabled) return;
                        setPlacementShapeType(it.shapeType);
                        setPlacementShapeVariant(it.variant ?? null);
                      }}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <hr />

      {/* SECTION B */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
        <div className="propsRow">
          <div className="muted">Shape Properties</div>
          <div>{selectedShape ? `#${shortId(selectedShape.id)}` : 'None'}</div>
        </div>

        {selectedShape ? (
          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
            <div className="propsRow" style={{ padding: 0 }}>
              <span className="muted">Fill</span>
              <div className="row gap">
                <label className="row gap" style={{ alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedShape.style.fill === 'none'}
                    onChange={(e) => {
                      patchShape(activePageIndex, selectedShape.id, {
                        style: {
                          ...selectedShape.style,
                          fill: e.target.checked ? 'none' : '#ffffff',
                        },
                      });
                    }}
                  />
                  <span className="muted">None</span>
                </label>
                <input
                  type="color"
                  value={selectedShape.style.fill === 'none' ? '#ffffff' : selectedShape.style.fill}
                  disabled={selectedShape.style.fill === 'none'}
                  onChange={(e) => {
                    patchShape(activePageIndex, selectedShape.id, {
                      style: { ...selectedShape.style, fill: e.target.value },
                    });
                  }}
                />
              </div>
            </div>

            <div className="propsRow" style={{ padding: 0 }}>
              <span className="muted">Stroke</span>
              <input
                type="color"
                value={selectedShape.style.stroke}
                onChange={(e) => {
                  patchShape(activePageIndex, selectedShape.id, {
                    style: { ...selectedShape.style, stroke: e.target.value },
                  });
                }}
              />
            </div>

            <div className="propsRow" style={{ padding: 0 }}>
              <span className="muted">Stroke width</span>
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={selectedShape.style.strokeWidth}
                onChange={(e) => {
                  patchShape(activePageIndex, selectedShape.id, {
                    style: {
                      ...selectedShape.style,
                      strokeWidth: Math.max(0, Math.min(40, Number(e.target.value) || 0)),
                    },
                  });
                }}
                style={{ width: 90 }}
              />
            </div>

            <div className="propsRow" style={{ padding: 0 }}>
              <span className="muted">Opacity</span>
              <div className="row gap">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedShape.style.opacity}
                  onChange={(e) => {
                    patchShape(activePageIndex, selectedShape.id, {
                      style: { ...selectedShape.style, opacity: Math.max(0, Math.min(1, Number(e.target.value) || 1)) },
                    });
                  }}
                />
                <span className="muted">{Math.round(selectedShape.style.opacity * 100)}%</span>
              </div>
            </div>

            <div className="propsRow" style={{ padding: 0 }}>
              <span className="muted">Layer</span>
              <div className="row gap" style={{ flexWrap: 'wrap' }}>
                <button type="button" onClick={() => reorderShapeLayer(activePageIndex, selectedShape.id, 'back')}>Send to back</button>
                <button type="button" onClick={() => reorderShapeLayer(activePageIndex, selectedShape.id, 'backward')}>Send backward</button>
                <button type="button" onClick={() => reorderShapeLayer(activePageIndex, selectedShape.id, 'forward')}>Bring forward</button>
                <button type="button" onClick={() => reorderShapeLayer(activePageIndex, selectedShape.id, 'front')}>Bring to front</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="muted" style={{ padding: 10 }}>
            Select a shape to edit properties.
          </div>
        )}
      </div>

      <hr />

      {/* SECTION C */}
      <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
        <div className="propsRow">
          <div className="muted">Added Shapes</div>
          <div>{shapesOnPage.length}</div>
        </div>

        <div className="textList">
          {shapesOnPage.length === 0 ? (
            <div className="muted" style={{ padding: 10 }}>
              No shapes on this page.
            </div>
          ) : (
            shapesOnPage.map((s) => {
              const isActive = s.id === selectedShapeId;
              const label = `${s.shapeType} #${shortId(s.id)}`;
              return (
                <div key={s.id} className="textListRow">
                  <button
                    type="button"
                    className={isActive ? 'textListItem active' : 'textListItem'}
                    onClick={() => {
                      setSelectedShapeId(s.id);
                    }}
                    title={label}
                  >
                    <div className="textListItemTitle">{label}</div>
                    <div className="textListItemMeta">Page {activePageIndex + 1}</div>
                  </button>

                  <div className="textListActions">
                    <button
                      type="button"
                      className="textListDelete"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateOverlayObject(activePageIndex, s.id);
                      }}
                      title="Copy"
                      aria-label="Copy shape"
                    >
                      <IconCopy />
                    </button>

                    <button
                      type="button"
                      className="textListDelete"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeShape(activePageIndex, s.id);
                        if (useUiStore.getState().selectedShapeId === s.id) {
                          setSelectedShapeId(null);
                        }
                      }}
                      title="Delete"
                      aria-label="Delete shape"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
