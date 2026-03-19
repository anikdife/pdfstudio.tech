import { useState } from 'react';

export function MergePdfModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!props.isOpen) return null;

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalHeader">
          <div>Merge PDF</div>
          <button type="button" onClick={props.onClose} disabled={busy}>Close</button>
        </div>

        <div className="modalBody">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="muted" style={{ marginTop: 8 }}>
            Select a PDF to append (or insert after selection).
          </div>
        </div>

        <div className="modalFooter">
          <button
            type="button"
            disabled={!file || busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              try {
                await props.onMerge(file);
                props.onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
