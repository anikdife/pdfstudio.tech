import { useEffect, useMemo, useRef, useState } from 'react';
import { useGoogleStore } from '../../state/googleStore';
import { useFirebaseUserStore } from '../../state/firebaseUserStore';
import { downloadFile, deleteFile, updateFile, createFile } from '../../services/googleDriveClient';
import { ensureDriveToken } from '../../services/googleDriveAuth';
import { useDocumentStore } from '../../editor/state/documentStore';
import { exportCurrentDoc } from '../../editor/export/exportPdf';
import { logFileOpened, logFileSaved } from '../../services/firebaseActivity';

function uint8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

function bytesToHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isoToLocal(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function DriveDashboard() {
  // Drive store
  const auth = useGoogleStore((s) => s.auth);
  const isOpen = useGoogleStore((s) => s.isDashboardOpen);
  const isDriveAuthLoading = useGoogleStore((s) => s.isAuthLoading);
  const files = useGoogleStore((s) => s.driveFiles);
  const refresh = useGoogleStore((s) => s.refreshDriveFiles);
  const beginDriveConnectFromClick = useGoogleStore((s) => s.beginDriveConnectFromClick);
  const connectDriveInteractive = useGoogleStore((s) => s.connectDriveInteractive);
  const lastDriveError = useGoogleStore((s) => s.lastDriveError);
  const closeDashboard = useGoogleStore((s) => s.closeDashboard);
  const signOutDrive = useGoogleStore((s) => s.signOut);

  // Firebase store (source of truth for "app login")
  const firebaseUser = useFirebaseUserStore((s) => s.firebaseUser);
  const isFirebaseAuthReady = useFirebaseUserStore((s) => s.isAuthReady);
  const isFirebaseAuthLoading = useFirebaseUserStore((s) => s.isAuthLoading);
  const signInFirebase = useFirebaseUserStore((s) => s.signInFirebase);

  // Editor state
  const isDirty = useDocumentStore((s) => s.isDirty);
  const loadPdfFromFile = useDocumentStore((s) => s.loadPdfFromFile);
  const doc = useDocumentStore((s) => s.doc);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [busyProgress, setBusyProgress] = useState<{ loaded: number; total?: number } | null>(null);
  const [busyGlobal, setBusyGlobal] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const closingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAppSignedIn = Boolean(firebaseUser?.uid);
  const canUseDrive = Boolean(auth?.isSignedIn) && isAppSignedIn;

  const ensureAuthForAction = async (): Promise<boolean> => {
    // Never open Drive auth if app is not signed in
    if (!isAppSignedIn) return false;

    // Prefer cached token (no popup). If missing/expired, fall back to click-driven flow.
    try {
      await ensureDriveToken(false);
      return true;
    } catch {
      return await connectDriveInteractive();
    }
  };

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPanelOpen(false);
    window.setTimeout(() => {
      closeDashboard();
      closingRef.current = false;
    }, 160);
  };

  useEffect(() => {
    if (!isOpen) return;

    // Populate immediately when opening, but never prompt from here.
    void refresh(false);

    // Animate in on next frame.
    setPanelOpen(false);
    closingRef.current = false;
    const raf = window.requestAnimationFrame(() => {
      setPanelOpen(true);
      window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, refresh, closeDashboard]);

  const fileRows = useMemo(() => {
    return files.map((f) => {
      const sizeN = Number(f.size);
      return {
        ...f,
        sizeLabel: Number.isFinite(sizeN) ? bytesToHuman(sizeN) : '—',
        modifiedLabel: isoToLocal(f.modifiedTime),
      };
    });
  }, [files]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return fileRows;
    return fileRows.filter((f) => String(f.name ?? '').toLowerCase().includes(q));
  }, [fileRows, searchQuery]);

  if (!isOpen) return null;

  const primaryHint = !isFirebaseAuthReady
    ? 'Loading your account…'
    : !isAppSignedIn
      ? 'Sign in to the app first to use Drive sync.'
      : auth?.isSignedIn
        ? ''
        : 'Connect Google Drive to view Drive files.';

  return (
    <div
      className="driveDashBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cloud Files"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className={panelOpen ? 'driveDashPanel open' : 'driveDashPanel'}>
        <div className="driveDashHeader">
          <div>
            <div className="driveDashTitle">Cloud Files</div>

            {canUseDrive ? (
              <div className="driveDashUserRow">
                {auth?.avatarUrl ? (
                  <img className="driveDashAvatar" src={auth.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className="driveDashAvatarPlaceholder" aria-hidden="true" />
                )}
                <div className="driveDashUserMeta">
                  <div className="driveDashUserName">{auth?.userName ?? 'Google user'}</div>
                  <div className="driveDashUserEmail">{auth?.userEmail ?? ''}</div>
                </div>
              </div>
            ) : (
              <div className="driveDashHint">{primaryHint}</div>
            )}
          </div>

          <button ref={closeBtnRef} className="driveDashClose" onClick={requestClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="driveDashActions">
          {/* Step 1: Firebase sign-in required */}
          {!isAppSignedIn ? (
            <button
              className="driveDashBtn"
              onClick={async () => {
                try {
                  await signInFirebase();
                } catch (e) {
                  // best-effort; firebase store already sets lastAuthError
                  // eslint-disable-next-line no-console
                  console.error(e);
                }
              }}
              disabled={
                busyGlobal ||
                busyId != null ||
                isFirebaseAuthLoading ||
                !isFirebaseAuthReady // don’t allow clicks mid-hydration
              }
            >
              {isFirebaseAuthLoading ? 'Signing in…' : 'Sign in to app'}
            </button>
          ) : null}

          {/* Step 2: Drive connect after Firebase */}
          {isAppSignedIn && !auth?.isSignedIn ? (
            <button
              className="driveDashBtn"
              onClick={() => {
                beginDriveConnectFromClick();
              }}
              disabled={busyGlobal || busyId != null || isDriveAuthLoading || !isFirebaseAuthReady}
            >
              {isDriveAuthLoading ? 'Signing in…' : 'Connect Google Drive'}
            </button>
          ) : null}

          <button
            className="driveDashBtn"
            onClick={async () => {
              await refresh(true);
            }}
            disabled={!canUseDrive || busyGlobal || busyId != null}
          >
            Refresh
          </button>

          <button
            className="driveDashBtn"
            onClick={async () => {
              if (!canUseDrive) return;
              if (!doc) {
                alert('No document is loaded.');
                return;
              }

              const ok = await ensureAuthForAction();
              if (!ok) return;

              const defaultName = `${doc.meta.title || 'document'}.pdf`;
              const name = (prompt('Upload as file name:', defaultName) || '').trim();
              if (!name) return;

              setBusyGlobal(true);
              try {
                const bytes = await exportCurrentDoc();
                const blob = new Blob([uint8ToArrayBuffer(bytes)], { type: 'application/pdf' });
                await createFile({ name, blob });
                void logFileSaved(name, 'googleDrive');
                await refresh(false);
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Upload failed');
              } finally {
                setBusyGlobal(false);
              }
            }}
            disabled={!canUseDrive || busyGlobal || busyId != null}
          >
            Upload current document
          </button>

          <div className="driveDashSearchWrap" aria-hidden={!canUseDrive}>
            <input
              className="driveDashSearchInput"
              type="text"
              placeholder="Search Drive files"
              value={searchQuery}
              disabled={!canUseDrive || busyGlobal || busyId != null}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className="driveDashBtn danger"
            onClick={async () => {
              setBusyGlobal(true);
              try {
                await signOutDrive();
              } finally {
                setBusyGlobal(false);
              }
            }}
            disabled={!canUseDrive || busyGlobal || busyId != null}
          >
            Sign out
          </button>
        </div>

        {lastDriveError ? (
          <div className="driveDashHint" style={{ margin: '0 18px 10px 18px', color: 'rgba(248,113,113,0.95)' }}>
            {lastDriveError}
          </div>
        ) : null}

        <div className="driveDashList">
          <div className="driveDashListHeader">
            <div>Name</div>
            <div>Modified</div>
            <div>Size</div>
            <div />
          </div>

          {filteredRows.length === 0 ? (
            <div className="driveDashEmpty">
              {searchQuery.trim()
                ? 'No matching files.'
                : 'No PDFs found in the Drive folder "pdfstudio-tech". Upload a document here to add one.'}
            </div>
          ) : null}

          {filteredRows.map((f) => (
            <div key={f.id} className="driveDashRow">
              <div className="driveDashName" title={f.name}>
                {f.name}
              </div>
              <div className="driveDashModified">{f.modifiedLabel}</div>
              <div className="driveDashSize">{f.sizeLabel}</div>
              <div className="driveDashRowActions">
                <button
                  className="driveDashMiniBtn"
                  disabled={!canUseDrive || busyGlobal || (busyId != null && busyId !== f.id)}
                  onClick={async () => {
                    if (!canUseDrive) return;
                    if (isDirty) {
                      const ok = confirm('You have unsaved changes. Open from Drive and discard them?');
                      if (!ok) return;
                    }

                    setBusyId(f.id);
                    setBusyText('Preparing…');
                    setBusyProgress(null);

                    const ok = await ensureAuthForAction();
                    if (!ok) {
                      setBusyId(null);
                      setBusyText(null);
                      setBusyProgress(null);
                      return;
                    }

                    try {
                      setBusyText('Downloading…');
                      const blob = await downloadFile(f.id, {
                        onProgress: (p) => {
                          setBusyProgress(p);
                        },
                      });
                      setBusyText('Opening…');
                      const file = new File([blob], f.name, { type: 'application/pdf' });
                      await loadPdfFromFile(file);
                      void logFileOpened(file.name, 'googleDrive');
                      requestClose();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'Open failed');
                    } finally {
                      setBusyId(null);
                      setBusyText(null);
                      setBusyProgress(null);
                    }
                  }}
                >
                  {busyId === f.id
                    ? busyText
                      ? busyText === 'Downloading…' && busyProgress
                        ? `Downloading… ${bytesToHuman(busyProgress.loaded)}${
                            busyProgress.total ? ` / ${bytesToHuman(busyProgress.total)}` : ''
                          }`
                        : busyText
                      : 'Working…'
                    : 'Open'}
                </button>

                <button
                  className="driveDashMiniBtn"
                  disabled={!canUseDrive || !doc || busyGlobal || (busyId != null && busyId !== f.id)}
                  onClick={async () => {
                    if (!canUseDrive) return;
                    if (!doc) return;
                    const ok = confirm('Replace this Drive file with your current document?');
                    if (!ok) return;

                    const ok2 = await ensureAuthForAction();
                    if (!ok2) return;

                    setBusyId(f.id);
                    try {
                      const bytes = await exportCurrentDoc();
                      const blob = new Blob([uint8ToArrayBuffer(bytes)], { type: 'application/pdf' });
                      await updateFile({ fileId: f.id, blob });
                      void logFileSaved(f.name ?? 'unknown', 'googleDrive');
                      await refresh(false);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'Update failed');
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Replace
                </button>

                <button
                  className="driveDashMiniBtn danger"
                  disabled={!canUseDrive || busyGlobal || (busyId != null && busyId !== f.id)}
                  onClick={async () => {
                    if (!canUseDrive) return;
                    const ok = confirm(`Delete "${f.name}" from Drive?`);
                    if (!ok) return;

                    const ok2 = await ensureAuthForAction();
                    if (!ok2) return;

                    setBusyId(f.id);
                    try {
                      await deleteFile(f.id);
                      await refresh(false);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'Delete failed');
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {busyGlobal ? <div className="driveDashBusy" aria-hidden="true">Working…</div> : null}
      </div>
    </div>
  );
}
