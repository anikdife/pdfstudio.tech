import { useUiStore } from '../../state/uiStore';

const PAGE_NUMBER_FORMAT_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Page 1 of 10', value: 'Page {page} of {total}' },
  { label: '1 / 10', value: '{page} / {total}' },
  { label: '1 of 10', value: '{page} of {total}' },
  { label: 'Page 1', value: 'Page {page}' },
  { label: '1', value: '{page}' },
  { label: 'p. 1 / 10', value: 'p. {page} / {total}' },
  { label: '- 1 -', value: '- {page} -' },
];

function normalizeHexColor(input: string | undefined, fallback: string) {
  const v = (input ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const m3 = v.match(/^#([0-9a-fA-F]{3})$/);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function WatermarkPageNumbersPanel() {
  const exportStamps = useUiStore((s) => s.exportStamps);
  const patchExportStamps = useUiStore((s) => s.patchExportStamps);

  const presetValue =
    PAGE_NUMBER_FORMAT_PRESETS.find((p) => p.value === exportStamps.pageNumbers.format)?.value ?? '__custom';

  return (
    <div style={{ padding: 10 }}>
      <div className="propsRow">
        <span className="muted">Page numbers</span>
        <label className="studioToggle" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={exportStamps.pageNumbers.enabled}
            onChange={(e) => patchExportStamps({ pageNumbers: { enabled: e.target.checked } as any })}
            aria-label="Enable page numbers"
          />
          <span className="studioToggleTrack" aria-hidden="true">
            <span className="studioToggleThumb" />
          </span>
        </label>
      </div>

      {exportStamps.pageNumbers.enabled && (
        <>
          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="muted">Position</div>
              <select
                value={exportStamps.pageNumbers.position}
                onChange={(e) => patchExportStamps({ pageNumbers: { position: e.target.value as any } as any })}
                style={{ width: '100%' }}
              >
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </label>
            <label style={{ width: 120 }}>
              <div className="muted">Size</div>
              <input
                type="number"
                value={exportStamps.pageNumbers.fontSize}
                onChange={(e) => patchExportStamps({ pageNumbers: { fontSize: Number(e.target.value) } as any })}
                style={{ width: '100%' }}
              />
            </label>
          </div>

          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="muted">Color</div>
              <div className="row gap">
                <input
                  type="color"
                  value={normalizeHexColor(exportStamps.pageNumbers.color, '#111111')}
                  onChange={(e) => patchExportStamps({ pageNumbers: { color: e.target.value } as any })}
                  aria-label="Page number color"
                />
                <input
                  type="text"
                  value={exportStamps.pageNumbers.color}
                  onChange={(e) => patchExportStamps({ pageNumbers: { color: e.target.value } as any })}
                  style={{ width: '100%' }}
                />
              </div>
            </label>
          </div>

          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="muted">Format</div>
              <div className="iosSelectWrap">
                <select
                  className="iosSelect"
                  value={presetValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v !== '__custom') {
                      patchExportStamps({ pageNumbers: { format: v } as any });
                    }
                  }}
                >
                  <option value="__custom">Custom…</option>
                  {PAGE_NUMBER_FORMAT_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {presetValue === '__custom' && (
                <input
                  type="text"
                  value={exportStamps.pageNumbers.format}
                  onChange={(e) => patchExportStamps({ pageNumbers: { format: e.target.value } as any })}
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="Use {page} and {total}"
                />
              )}
            </label>
          </div>
        </>
      )}

      <hr style={{ margin: '12px 0' }} />

      <div className="propsRow">
        <span className="muted">Watermark</span>
        <label className="studioToggle" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={exportStamps.watermark.enabled}
            onChange={(e) => patchExportStamps({ watermark: { enabled: e.target.checked } as any })}
            aria-label="Enable watermark"
          />
          <span className="studioToggleTrack" aria-hidden="true">
            <span className="studioToggleThumb" />
          </span>
        </label>
      </div>

      {exportStamps.watermark.enabled && (
        <>
          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="muted">Text</div>
              <input
                type="text"
                value={exportStamps.watermark.text}
                onChange={(e) => patchExportStamps({ watermark: { text: e.target.value } as any })}
                style={{ width: '100%' }}
              />
            </label>
          </div>

          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ width: 120 }}>
              <div className="muted">Opacity</div>
              <input
                type="number"
                step="0.05"
                value={exportStamps.watermark.opacity}
                onChange={(e) => patchExportStamps({ watermark: { opacity: Number(e.target.value) } as any })}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ width: 120 }}>
              <div className="muted">Rotate</div>
              <input
                type="number"
                value={exportStamps.watermark.rotation}
                onChange={(e) => patchExportStamps({ watermark: { rotation: Number(e.target.value) } as any })}
                style={{ width: '100%' }}
              />
            </label>
            <label style={{ width: 120 }}>
              <div className="muted">Size</div>
              <input
                type="number"
                value={exportStamps.watermark.fontSize}
                onChange={(e) => patchExportStamps({ watermark: { fontSize: Number(e.target.value) } as any })}
                style={{ width: '100%' }}
              />
            </label>
          </div>

          <div className="row gap" style={{ paddingTop: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="muted">Color</div>
              <div className="row gap">
                <input
                  type="color"
                  value={normalizeHexColor(exportStamps.watermark.color, '#111111')}
                  onChange={(e) => patchExportStamps({ watermark: { color: e.target.value } as any })}
                  aria-label="Watermark color"
                />
                <input
                  type="text"
                  value={exportStamps.watermark.color}
                  onChange={(e) => patchExportStamps({ watermark: { color: e.target.value } as any })}
                  style={{ width: '100%' }}
                />
              </div>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
