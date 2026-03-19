import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChangedListener, type FirebaseIdentity } from '../../services/firebaseAuth';
import { fetchAllFeedback, type FeedbackRecord } from '../../services/feedbackService';

const ADMIN_EMAIL = 'anik.dife@gmail.com';

function isAdmin(identity: FirebaseIdentity): boolean {
  return !!identity.isLoggedIn && (identity.email ?? '').toLowerCase() === ADMIN_EMAIL;
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

export default function FeedbackAdminPage() {
  const nav = useNavigate();
  const [identity, setIdentity] = useState<FirebaseIdentity>({
    uid: null,
    displayName: null,
    email: null,
    photoURL: null,
    isLoggedIn: false,
  });

  const [rows, setRows] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChangedListener((id) => setIdentity(id));
    return () => unsub();
  }, []);

  const allowed = useMemo(() => isAdmin(identity), [identity]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const all = await fetchAllFeedback();
        if (cancelled) return;
        setRows(all);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load feedback');
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  return (
    <div className="fbAdminPage">
      <div className="fbAdminTop">
        <div>
          <div className="fbAdminTitle">All feedback</div>
          <div className="fbAdminSub">Admin-only view (temporary hardcoded email gate).</div>
        </div>
        <div className="fbAdminActions">
          <button type="button" className="fbAdminBtn" onClick={() => nav('/')}>
            Home
          </button>
          <button type="button" className="fbAdminBtn" onClick={() => nav('/editor')}>
            Editor
          </button>
        </div>
      </div>

      {!allowed ? (
        <div className="fbAdminCard" role="alert">
          Not authorized.
        </div>
      ) : loading ? (
        <div className="fbAdminCard" role="status">
          Loading…
        </div>
      ) : error ? (
        <div className="fbAdminCard fbAdminCardError" role="alert">
          {error}
        </div>
      ) : (
        <div className="fbAdminTableWrap" role="region" aria-label="Feedback table">
          <table className="fbAdminTable">
            <thead>
              <tr>
                <th>Created</th>
                <th>Category</th>
                <th>Rating</th>
                <th>Contact</th>
                <th>Trying to do</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="fbAdminMono">{fmtDate(r.createdAt)}</td>
                  <td>{r.category}</td>
                  <td className="fbAdminMono">{r.rating ?? ''}</td>
                  <td className="fbAdminMono">{r.email ?? ''}</td>
                  <td>{r.tryingToDo}</td>
                  <td>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="fbAdminFootnote">
            Tip: scroll horizontally if needed.
          </div>
        </div>
      )}
    </div>
  );
}
