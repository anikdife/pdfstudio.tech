import { useEffect, useMemo, useRef, useState } from 'react';
import { useFirebaseUserStore } from '../../state/firebaseUserStore';
import { fetchRecentActivityDays, fetchUserMeta, fetchUserSection, type ActivityDay, type UserMeta } from '../../services/firebaseActivity';

function initials(nameOrEmail: string | null): string {
  if (!nameOrEmail) return 'U';
  const parts = nameOrEmail.trim().split(/\s+/g).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AccountButton() {
  const firebaseUser = useFirebaseUserStore((s) => s.firebaseUser);
  const isAuthLoading = useFirebaseUserStore((s) => s.isAuthLoading);
  const lastAuthError = useFirebaseUserStore((s) => s.lastAuthError);
  const signInFirebase = useFirebaseUserStore((s) => s.signInFirebase);
  const signOutFirebase = useFirebaseUserStore((s) => s.signOutFirebase);

  const canShowRemoteAvatar = useMemo(() => {
    try {
      return !Boolean((window as any).crossOriginIsolated);
    } catch {
      return true;
    }
  }, []);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [meta, setMeta] = useState<UserMeta | null>(null);
  const [historyDays, setHistoryDays] = useState<ActivityDay[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  type SectionId = 'subscription' | 'security';
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [sectionLoading, setSectionLoading] = useState<SectionId | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<any | null>(null);
  const [securityData, setSecurityData] = useState<any | null>(null);

  const label = useMemo(() => {
    if (!firebaseUser) return 'Sign in';
    return firebaseUser.displayName || firebaseUser.email || 'Account';
  }, [firebaseUser]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Load top-bar account metadata (last login + last public IP).
    void (async () => {
      const m = await fetchUserMeta();
      if (m) setMeta(m);
    })();

    // History is always visible.
    void (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const days = await fetchRecentActivityDays(7);
        setHistoryDays(days);
      } catch (e) {
        setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
        setHistoryDays([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [open, firebaseUser?.uid]);

  const fmtTs = (ts?: { toDate: () => Date } | null) => {
    try {
      if (!ts) return '—';
      return ts.toDate().toLocaleString();
    } catch {
      return '—';
    }
  };

  const fmtDay = (id: string) => {
    // id is YYYY-MM-DD
    try {
      const [y, m, d] = id.split('-').map((x) => parseInt(x, 10));
      if (!y || !m || !d) return id;
      return new Date(y, m - 1, d).toLocaleDateString();
    } catch {
      return id;
    }
  };

  const fmtSource = (machine?: ActivityDay['events'][number]['machine']): string => {
    if (machine === 'googleDrive') return 'Google Drive';
    if (!machine) return '—';
    // Treat all local device markers as "this device".
    if (machine === 'local' || machine === 'win32' || machine === 'mac' || machine === 'linux' || machine === 'android' || machine === 'ios') {
      return 'this device';
    }
    return 'this device';
  };

  const fmtSavedTo = (savedTo?: ActivityDay['events'][number]['savedTo']): string => {
    if (savedTo === 'googleDrive') return 'Google Drive';
    if (!savedTo) return '—';
    if (savedTo === 'local' || savedTo === 'win32' || savedTo === 'mac' || savedTo === 'linux' || savedTo === 'android' || savedTo === 'ios') {
      return 'this device';
    }
    return 'this device';
  };

  const unhideSection = (id: SectionId) => {
    setActiveSection(id);
    if (id === 'subscription' && subscriptionData == null) {
      setSectionLoading('subscription');
      // Lazy-load: reserved for future backend; keep it Firebase-scoped.
      void (async () => {
        try {
          const data = await fetchUserSection('subscription');
          setSubscriptionData(data ?? { status: 'unknown' });
        } finally {
          setSectionLoading(null);
        }
      })();
    }
    if (id === 'security' && securityData == null) {
      setSectionLoading('security');
      void (async () => {
        try {
          const data = await fetchUserSection('security');
          setSecurityData(data ?? { sessions: 'unknown' });
        } finally {
          setSectionLoading(null);
        }
      })();
    }
  };

  if (!firebaseUser) {
    return (
      <div>
        <button
          className="button-30 firebaseAccountBtn"
          type="button"
          disabled={isAuthLoading}
          onClick={async () => {
            try {
              await signInFirebase();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(err);
              alert(err instanceof Error ? err.message : 'Sign-in failed');
            }
          }}
          title={lastAuthError ? `Sign-in error: ${lastAuthError}` : 'Sign in to sync preferences'}
        >
          {isAuthLoading ? 'Signing in…' : 'Sign in'}
        </button>
        {lastAuthError ? <div className="firebaseAccountMuted">{lastAuthError}</div> : null}
      </div>
    );
  }

  return (
    <div className="firebaseAccountWrap" ref={wrapRef}>
      <button
        className="button-30 firebaseAccountBtn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        {firebaseUser.photoURL && canShowRemoteAvatar ? (
          <img className="firebaseAccountAvatar" src={firebaseUser.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="firebaseAccountInitials" aria-hidden="true">
            {initials(firebaseUser.displayName || firebaseUser.email)}
          </span>
        )}
      </button>

      {open ? (
        <div className="firebaseAccountMenu" role="menu">
          <div className="firebaseAccountMenuTop" role="presentation">
            <div className="firebaseAccountTopLeft">
              {firebaseUser.photoURL && canShowRemoteAvatar ? (
                <img className="firebaseAccountAvatar firebaseAccountAvatarLarge" src={firebaseUser.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="firebaseAccountInitials firebaseAccountInitialsLarge" aria-hidden="true">
                  {initials(firebaseUser.displayName || firebaseUser.email)}
                </span>
              )}

              <div className="firebaseAccountTopText">
                <div className="firebaseAccountTopName">{firebaseUser.displayName || 'Signed in'}</div>
                <div className="firebaseAccountTopEmail">{firebaseUser.email || '—'}</div>
                <div className="firebaseAccountTopMeta">
                  <div>Last logged-in: {fmtTs(meta?.lastLoggedInAt ?? null)}</div>
                  <div>Last public IP: {meta?.lastPublicIp ?? '—'}</div>
                </div>
              </div>
            </div>

            <div className="firebaseAccountTopRight">
              <button
                className="firebaseAccountMenuItem firebaseAccountSignOutBtn"
                type="button"
                role="menuitem"
                disabled={isAuthLoading}
                onClick={async () => {
                  try {
                    await signOutFirebase();
                  } finally {
                    setOpen(false);
                  }
                }}
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="firebaseAccountMenuBody" role="presentation">
            <div className="firebaseAccountCard firebaseAccountHistoryCard" role="presentation">
              <div className="firebaseAccountCardHeader">History</div>
              <div className="firebaseAccountHistoryScroll" role="presentation">
                {historyLoading ? <div className="firebaseAccountMuted">Loading…</div> : null}
                {historyError ? <div className="firebaseAccountMuted">{historyError}</div> : null}
                {!historyLoading && !historyError && (historyDays?.length ?? 0) === 0 ? (
                  <div className="firebaseAccountMuted">No history yet.</div>
                ) : null}
                {historyDays?.map((d) => (
                  <div key={d.id} className="firebaseAccountDay">
                    <div className="firebaseAccountDayHeader">{fmtDay(d.id)}</div>
                    {d.events.length === 0 ? <div className="firebaseAccountMuted">No events.</div> : null}
                    {d.events.slice(0, 50).map((ev, idx) => (
                      <div key={idx} className="firebaseAccountEvent">
                        <div className="firebaseAccountEventLeft">
                          <span className="firebaseAccountEventType">
                            {ev.type === 'open' ? 'OPENED' : ev.type === 'save' ? 'SAVED' : 'EXPORTED'}
                          </span>
                          <span className="firebaseAccountEventFile">{ev.filename}</span>
                        </div>
                        <div className="firebaseAccountEventRight">
                          <span className="firebaseAccountEventMeta">
                            {(() => {
                              if (ev.type === 'open') {
                                return `opened from ${fmtSource(ev.machine)}`;
                              }

                              const editedSuffix =
                                typeof ev.edited === 'boolean' ? (ev.edited ? ' (edited)' : ' (clean)') : '';
                              return `saved to ${fmtSavedTo(ev.savedTo)}${editedSuffix}`;
                            })()}
                          </span>
                          <span className="firebaseAccountEventTs">{fmtTs(ev.ts)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="firebaseAccountCard" role="presentation" data-hidden={activeSection !== 'subscription'}>
              <div className="firebaseAccountCardHeaderRow">
                <div className="firebaseAccountCardHeader">Subscription</div>
                <button
                  className="firebaseAccountUnhideBtn"
                  type="button"
                  onClick={() => unhideSection('subscription')}
                  disabled={sectionLoading === 'subscription'}
                >
                  {activeSection === 'subscription' ? 'Shown' : 'Unhide'}
                </button>
              </div>

              {activeSection === 'subscription' ? (
                <div className="firebaseAccountCardBody">
                  {sectionLoading === 'subscription' ? (
                    <div className="firebaseAccountMuted">Loading…</div>
                  ) : (
                    <div className="firebaseAccountMuted">
                      {subscriptionData?.status === 'unknown' ? 'No subscription data loaded yet.' : '—'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="firebaseAccountCardHidden">
                  <div className="firebaseAccountMuted">Hidden. Click Unhide to load.</div>
                </div>
              )}
            </div>

            <div className="firebaseAccountCard" role="presentation" data-hidden={activeSection !== 'security'}>
              <div className="firebaseAccountCardHeaderRow">
                <div className="firebaseAccountCardHeader">Security</div>
                <button
                  className="firebaseAccountUnhideBtn"
                  type="button"
                  onClick={() => unhideSection('security')}
                  disabled={sectionLoading === 'security'}
                >
                  {activeSection === 'security' ? 'Shown' : 'Unhide'}
                </button>
              </div>

              {activeSection === 'security' ? (
                <div className="firebaseAccountCardBody">
                  {sectionLoading === 'security' ? (
                    <div className="firebaseAccountMuted">Loading…</div>
                  ) : (
                    <div className="firebaseAccountMuted">No security data loaded yet.</div>
                  )}
                </div>
              ) : (
                <div className="firebaseAccountCardHidden">
                  <div className="firebaseAccountMuted">Hidden. Click Unhide to load.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
