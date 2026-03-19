import { useState } from 'react';

export function SplitModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onSplit: (rangesText: string) => Promise<void>;
}) {
  const [rangesText, setRangesText] = useState('1-3');
  const [busy, setBusy] = useState(false);

  if (!props.isOpen) return null;

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>Split PDF</div>
          <button type="button" onClick={props.onClose} disabled={busy}>Close</button>
        </div>

        <div className="modalBody">
          <div className="muted">Ranges (e.g. 1-3,5,7-9)</div>
          <input
            type="text"
            value={rangesText}
            onChange={(e) => setRangesText(e.target.value)}
            style={{ width: '100%', marginTop: 6 }}
          />
        </div>

        <div className="modalFooter">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onSplit(rangesText);
                props.onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Export splits
          </button>
        </div>
      </div>
    </div>
  );
}
