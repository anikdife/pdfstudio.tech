import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { submitFeedback, type FeedbackCategory } from '../../services/feedbackService';
import { onAuthStateChangedListener, type FirebaseIdentity } from '../../services/firebaseAuth';

interface FeedbackOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'ui-confusion', label: 'UI confusion' },
  { value: 'performance', label: 'Performance issue' },
  { value: 'other', label: 'Other' },
];

function buildBrowserInfo(): string {
  try {
    const ua = navigator.userAgent;
    const platform = (navigator as any).platform ?? 'unknown';
    return `ua=${ua}; platform=${platform}`;
  } catch {
    return 'ua=unknown; platform=unknown';
  }
}

export function FeedbackOverlay(props: FeedbackOverlayProps) {
  const { isOpen, onClose } = props;

  const nav = useNavigate();
  const [identity, setIdentity] = useState<FirebaseIdentity>({
    uid: null,
    displayName: null,
    email: null,
    photoURL: null,
    isLoggedIn: false,
  });

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    // Focus close for quick keyboard exit.
    const id = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = onAuthStateChangedListener((id) => setIdentity(id));
    return () => unsub();
  }, [isOpen]);

  const isAdmin = useMemo(() => {
    return !!identity.isLoggedIn && (identity.email ?? '').toLowerCase() === 'anik.dife@gmail.com';
  }, [identity.email, identity.isLoggedIn]);

  if (!isOpen) return null;

  const overlay = (
    <div className="feedbackOverlay" role="dialog" aria-modal="true" aria-label="Feedback">
      <button
        type="button"
        className="feedbackBackdrop"
        aria-label="Close feedback"
        onClick={onClose}
      />
      <div className="feedbackModal" role="document">
        <button
          ref={closeBtnRef}
          type="button"
          className="feedbackClose"
          aria-label="Close feedback"
          onClick={onClose}
        >
          ×
        </button>

        <div className="feedbackTitle">Feedback</div>
        <div className="feedbackSubtitle">We read every message.</div>

        <div className="feedbackBody">
          <FeedbackForm onClose={onClose} />
          <ContactsCard
            showAdmin={isAdmin}
            onAdmin={() => {
              onClose();
              nav('/feedback');
            }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function ContactsCard(props: { showAdmin: boolean; onAdmin: () => void }) {
  return (
    <aside className="feedbackContacts" aria-label="Contacts">
      <div className="feedbackContactsTitle">contacts:</div>
      <div className="feedbackContactsList">
        <a className="feedbackContactsEmail" href="mailto:sales@pdfstudio.tech">sales@pdfstudio.tech</a>
        <a className="feedbackContactsEmail" href="mailto:admin@pdfstudio.tech">admin@pdfstudio.tech</a>
        <a className="feedbackContactsEmail" href="mailto:anik.dife@gmail.com">anik.dife@gmail.com</a>
      </div>

      {props.showAdmin ? (
        <button
          type="button"
          className="feedbackContactsAdminBtn"
          onClick={props.onAdmin}
        >
          View all feedback
        </button>
      ) : null}
    </aside>
  );
}

function FeedbackForm(props: { onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [rating, setRating] = useState<number | null>(null);
  const [tryingToDo, setTryingToDo] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [email, setEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  const stepsRequired = category === 'bug';

  const canSubmit = useMemo(() => {
    if (!category) return false;
    if (!tryingToDo.trim()) return false;
    if (!description.trim()) return false;
    if (stepsRequired && !stepsToReproduce.trim()) return false;
    return true;
  }, [category, description, stepsRequired, stepsToReproduce, tryingToDo]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitState({ status: 'idle' });

    try {
      await submitFeedback({
        category,
        rating,
        tryingToDo: tryingToDo.trim(),
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim() || undefined,
        email: email.trim() || undefined,
        screenshotUrl: undefined,
        browserInfo: buildBrowserInfo(),
      });

      setSubmitState({
        status: 'success',
        message: 'Thank you! Your feedback helps improve pdfstudio.',
      });

      setTryingToDo('');
      setDescription('');
      setStepsToReproduce('');
      setEmail('');
      setRating(null);

      window.setTimeout(() => props.onClose(), 1700);
    } catch (err) {
      setSubmitState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not send feedback. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="feedbackForm" onSubmit={onSubmit}>
      <label className="feedbackLabel">
        Category
        <select
          className="feedbackSelect"
          value={category}
          onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
          disabled={isSubmitting}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="feedbackLabel">
        Rating (optional)
        <div className="feedbackRatingRow" role="group" aria-label="Rating">
          {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
            const active = (rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                className={`feedbackStar ${active ? 'isActive' : ''}`}
                onClick={() => setRating((prev) => (prev === n ? null : n))}
                disabled={isSubmitting}
                aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                aria-pressed={active}
              >
                ★
              </button>
            );
          })}
          {rating ? (
            <button
              type="button"
              className="feedbackClearRating"
              onClick={() => setRating(null)}
              disabled={isSubmitting}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <label className="feedbackLabel">
        What were you trying to do?
        <input
          className="feedbackInput"
          value={tryingToDo}
          onChange={(e) => setTryingToDo(e.target.value)}
          disabled={isSubmitting}
          placeholder="e.g. Merge two PDFs and add page numbers"
        />
      </label>

      <label className="feedbackLabel">
        Description
        <textarea
          className="feedbackTextarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
          placeholder="Tell us what happened, what you expected, or what you’d like to see."
          rows={5}
        />
      </label>

      <label className="feedbackLabel">
        Steps to reproduce {stepsRequired ? '(required for bugs)' : '(optional)'}
        <textarea
          className="feedbackTextarea"
          value={stepsToReproduce}
          onChange={(e) => setStepsToReproduce(e.target.value)}
          disabled={isSubmitting}
          placeholder={
            stepsRequired
              ? '1) Open a PDF\n2) Click …\n3) See error'
              : 'Optional — include steps if helpful'
          }
          rows={3}
        />
      </label>

      <label className="feedbackLabel">
        Email (optional — only if you’d like a reply)
        <input
          className="feedbackInput"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          placeholder="you@example.com"
          inputMode="email"
        />
      </label>

      {submitState.status === 'success' ? (
        <div className="feedbackSuccess" role="status">
          {submitState.message}
        </div>
      ) : null}

      {submitState.status === 'error' ? (
        <div className="feedbackError" role="alert">
          {submitState.message}
        </div>
      ) : null}

      <div className="feedbackActions">
        <button
          type="button"
          className="feedbackCancel"
          onClick={props.onClose}
          disabled={isSubmitting}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="feedbackSubmit"
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
      </div>

      <div className="feedbackNote">We read every message. No document content is ever sent.</div>
    </form>
  );
}
