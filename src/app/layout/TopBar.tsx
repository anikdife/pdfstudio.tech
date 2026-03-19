import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../../editor/state/documentStore';
import { exportCurrentDoc } from '../../editor/export/exportPdf';
import { downloadBytes } from '../../editor/util/file';
import { AccountButton } from './AccountButton';
import { logFileExported, setCurrentEditedFlag } from '../../services/firebaseActivity';

export function TopBar() {
  const navigate = useNavigate();
  const doc = useDocumentStore((s) => s.doc);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const status = useDocumentStore((s) => s.status);
  const setDocTitle = useDocumentStore((s) => s.setDocTitle);

  // Keep typing responsive: avoid pushing every keystroke into the global doc store.
  // Commit to the store on blur only.
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>(() => doc?.meta.title ?? '');

  // Sync draft when document changes (or when not actively editing).
  useEffect(() => {
    if (isEditingTitle) return;
    setDraftTitle(doc?.meta.title ?? '');
  }, [doc?.id, doc?.meta.title, isEditingTitle]);

  useEffect(() => {
    setCurrentEditedFlag(Boolean(isDirty));
  }, [isDirty]);

  return (
    <header className="topBar studioTopBar">
      <div className="topBarLeft">
        <button className="button-30 studioNavBtn" type="button" onClick={() => navigate('/')}>
          Home
        </button>
      </div>

      <div className="topBarCenter">
        <div className="title studioTitle">
          <div className="name">
            <input
              className="docTitleInput"
              type="text"
              value={draftTitle}
              placeholder={doc ? 'Untitled' : 'No document'}
              disabled={!doc}
              onFocus={() => setIsEditingTitle(true)}
              onBlur={() => {
                if (!doc) return;
                const current = doc?.meta.title ?? '';
                if (current !== draftTitle) setDocTitle(draftTitle);
                setIsEditingTitle(false);
              }}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="muted studioUnsaved">{isDirty ? 'Unsaved changes' : ' '}</div>
        </div>
      </div>

      <div className="topBarRight">
        {status.loading ? <span className="badge">Loading…</span> : null}
        {status.error ? <span className="badge errorBadge">{status.error}</span> : null}

        <AccountButton />

        <button
          className="button-30 studioExportBtn"
          type="button"
          disabled={!doc?.basePdfBytes}
          onClick={async () => {
            try {
              const bytes = await exportCurrentDoc();
              const effectiveTitle = (draftTitle || doc?.meta.title || 'document').trim() || 'document';
              const filename = effectiveTitle + '.pdf';
              downloadBytes(bytes, filename, 'application/pdf');
              void logFileExported(filename, 'local');
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(err);
              alert(err instanceof Error ? err.message : 'Export failed');
            }
          }}
        >
          Export
        </button>
      </div>
    </header>
  );
}
