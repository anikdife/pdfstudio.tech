import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TierComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'modal' | 'inline';
}

const TierComparisonModal: React.FC<TierComparisonModalProps> = ({ isOpen, onClose, variant = 'modal' }) => {
  const isInline = variant === 'inline';
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');
  const [active, setActive] = useState(0);
  const autoIntervalRef = useRef<number | null>(null);
  const autoResumeTimeoutRef = useRef<number | null>(null);

  const slides = useMemo(
    () => [
      {
        key: 'killer',
        kicker: 'Part 1 of 3',
        title: 'The “Killer” features (high conversion potential)',
        lead:
          'These are the things modern users expect when they land on a PDF site. Offering them free makes the product instantly compelling.',
        blocks: [
          {
            title: 'Google Drive deep integration',
            text:
              'Cloud-first workflows win. You don’t just open from Drive — you can replace files, and auto-recover back into a dedicated Drive folder, which feels like a premium-tier experience offered for free.',
          },
          {
            title: 'True browser-based PDF restructuring',
            text:
              'Many tools gate Merge / Split / Extract after 1–2 uses. Providing Merge, Split, and Page Extraction without a paywall is a major draw for students and office admins.',
          },
          {
            title: 'Advanced text styling',
            text:
              'Most free editors only allow basic “white-box” overlays. A real styling toolbar (line height, background colors, alignments) competes with Canva’s design-first expectations.',
          },
        ],
      },
      {
        key: 'diff',
        kicker: 'Part 2 of 3',
        title: 'Market-differentiating features',
        lead:
          'These make the app feel like a professional studio — not a basic web editor.',
        blocks: [
          {
            title: 'The Orbit Launcher',
            text:
              'UX is a product. A 3D, high-end launcher creates “premium” perception and makes the tool feel modern and expensive.',
          },
          {
            title: 'Layering & ordering (shape / image)',
            text:
              'Move to Front / Back is common in Illustrator-class tools, but rare in PDF editors. It’s valuable for brochures and visual reports.',
          },
          {
            title: 'Image filters & masks',
            text:
              'Masking images into hexagons/stars directly in a PDF is Canva-level. Most PDF editors require leaving the app to do this.',
          },
        ],
      },
      {
        key: 'gaps',
        kicker: 'Part 3 of 3',
        title: 'Free vs market leader gaps',
        lead:
          'To understand how competitive the free plan is, compare what the “Big 3” typically charge for.',
        table: {
          columns: ['Feature', 'Market leaders (Acrobat / Smallpdf)', 'pdfstudio.tech (Free)'],
          rows: [
            {
              feature: 'Unlimited page ops',
              leaders: 'Often limited to 2–3 per day',
              ours: 'Unlimited',
            },
            {
              feature: 'Google Drive sync',
              leaders: 'Usually a paid integration',
              ours: 'Built-in',
            },
            {
              feature: 'Rich text styling',
              leaders: 'Basic / paid',
              ours: 'Professional toolbar',
            },
            {
              feature: 'Multi-format open',
              leaders: '.docx often requires Premium',
              ours: 'Included (.docx, .xlsx, .md)',
            },
          ],
        },
      },
    ],
    [],
  );

  const stopAutoAdvance = () => {
    if (autoIntervalRef.current != null) {
      window.clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    if (autoResumeTimeoutRef.current != null) {
      window.clearTimeout(autoResumeTimeoutRef.current);
      autoResumeTimeoutRef.current = null;
    }
  };

  const startAutoAdvance = () => {
    if (autoIntervalRef.current != null) return;

    const AUTO_MS = 6500;
    autoIntervalRef.current = window.setInterval(() => {
      setActive((v) => (slides.length ? (v + 1) % slides.length : 0));
    }, AUTO_MS);
  };

  const pauseAndResumeAutoAdvance = () => {
    if (autoIntervalRef.current != null) {
      window.clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    if (autoResumeTimeoutRef.current != null) {
      window.clearTimeout(autoResumeTimeoutRef.current);
      autoResumeTimeoutRef.current = null;
    }

    const RESUME_AFTER_MS = 8000;
    autoResumeTimeoutRef.current = window.setTimeout(() => {
      autoResumeTimeoutRef.current = null;
      startAutoAdvance();
    }, RESUME_AFTER_MS);
  };

  const goPrev = (userInitiated = false) => {
    if (userInitiated) pauseAndResumeAutoAdvance();
    setActive((v) => {
      const n = slides.length;
      if (!n) return 0;
      return (v - 1 + n) % n;
    });
  };

  const goNext = (userInitiated = false) => {
    if (userInitiated) pauseAndResumeAutoAdvance();
    setActive((v) => {
      const n = slides.length;
      if (!n) return 0;
      return (v + 1) % n;
    });
  };

  const goTo = (index: number, userInitiated = false) => {
    if (userInitiated) pauseAndResumeAutoAdvance();
    setActive(() => {
      const n = slides.length;
      if (!n) return 0;
      const i = Math.max(0, Math.min(n - 1, index));
      return i;
    });
  };

  useEffect(() => {
    if (isInline) return;
    if (isOpen) {
      setShouldRender(true);
      setPhase('enter');
      return;
    }

    if (!shouldRender) return;

    setPhase('exit');
    const t = window.setTimeout(() => setShouldRender(false), 180);
    return () => window.clearTimeout(t);
  }, [isInline, isOpen, shouldRender]);

  useEffect(() => {
    const canRun = isInline ? Boolean(isOpen) : Boolean(isOpen && shouldRender && phase === 'enter');
    if (!canRun) {
      stopAutoAdvance();
      return;
    }

    startAutoAdvance();
    return () => {
      stopAutoAdvance();
    };
  }, [isInline, isOpen, shouldRender, phase]);

  useEffect(() => {
    if (isInline) return;
    if (!shouldRender) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev(true);
      if (e.key === 'ArrowRight') goNext(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isInline, onClose, shouldRender, slides.length]);

  useEffect(() => {
    if (isInline) return;
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isInline, isOpen]);

  useEffect(() => {
    if (isInline) return;
    if (!isOpen) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isInline, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setActive(0);
  }, [isOpen]);

  const carousel = (
    <div
      className="tierCarousel"
      aria-roledescription="carousel"
      aria-label="Feature highlights carousel"
      onKeyDown={(e) => {
        if (!isInline) return;
        if (e.key === 'ArrowLeft') goPrev(true);
        if (e.key === 'ArrowRight') goNext(true);
      }}
    >
      <div className="tierCarouselTop">
        {!isInline ? <div className="tierKicker">{slides[active]?.kicker}</div> : null}
        {!isInline ? <div className="tierIndex">{active + 1}/{slides.length}</div> : null}
      </div>

      <div key={slides[active]?.key || active} className="tierSlide tierSlideAnimated" role="group" aria-label={`${active + 1} of ${slides.length}`}>
        <div className="tierSlideTitle">{slides[active]?.title}</div>
        <div className="tierSlideLead">{slides[active]?.lead}</div>

        {'blocks' in (slides[active] as any) && (slides[active] as any).blocks ? (
          <div className="tierBlocks">
            {(slides[active] as any).blocks.map((b: { title: string; text: string }) => (
              <div key={b.title} className="tierBlock">
                <div className="tierBlockTitle">{b.title}</div>
                <div className="tierBlockText">{b.text}</div>
              </div>
            ))}
          </div>
        ) : null}

        {'table' in (slides[active] as any) && (slides[active] as any).table ? (
          <div className="tierCompare">
            <div className="tierCompareTable" role="table" aria-label="Free plan competitiveness comparison">
              <div className="tierCompareTh" role="columnheader">Feature</div>
              <div className="tierCompareTh" role="columnheader">Market leaders</div>
              <div className="tierCompareTh tierCompareThOurs" role="columnheader">Your free plan</div>

              {(slides[active] as any).table.rows.map((r: any) => (
                <React.Fragment key={r.feature}>
                  <div className="tierCompareTd tierCompareTdFeature" role="cell">{r.feature}</div>
                  <div className="tierCompareTd" role="cell">{r.leaders}</div>
                  <div className="tierCompareTd tierCompareTdOurs" role="cell">{r.ours}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="tierCarouselNav">
        <button
          type="button"
          className="tierNavBtn"
          onClick={() => goPrev(true)}
          aria-label="Previous slide"
        >
          Prev
        </button>

        <div className="tierDots" role="tablist" aria-label="Carousel navigation">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`tierDot ${i === active ? 'isActive' : ''}`}
              onClick={() => goTo(i, true)}
              aria-label={`Go to slide ${i + 1}`}
              aria-pressed={i === active}
            />
          ))}
        </div>

        <button
          type="button"
          className="tierNavBtn tierNavBtnPrimary"
          onClick={() => goNext(true)}
          aria-label="Next slide"
        >
          Next
        </button>
      </div>
    </div>
  );

  if (isInline) {
    return (
      <div className="tierInline" aria-label="Tier comparison carousel">
        <div className="tierInlineHead">
          <div className="tierInlineTitle">Tier comparison</div>
          <div className="tierInlineSub">Swipe through what makes the free plan compelling.</div>
        </div>
        {carousel}
      </div>
    );
  }

  if (!shouldRender) return null;

  const overlay = (
    <div className="tierOverlay" data-state={phase} role="dialog" aria-modal="true" aria-label="Tier comparison">
      <button
        type="button"
        className="tierBackdrop"
        aria-label="Close tier comparison"
        onClick={onClose}
      />

      <div className="tierModal" role="document">
        <div className="tierLayout">
          <div className="tierSide">
            <div className="tierSideIcon" aria-hidden="true">
              <CrownIcon className="tierSideIconSvg" />
            </div>

            <div className="tierSideTitle">Why it feels premium — for free</div>
            <div className="tierSideText">
              A 3-slide overview of the features that drive conversions, differentiate the product, and explain why the free plan competes with market leaders.
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              className="tierDismiss"
              onClick={onClose}
            >
              <XIcon className="tierDismissIco" />
              DISMISS
            </button>
          </div>

          <div className="tierMain">{carousel}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.0 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
      />
    </svg>
  );
}

function MinusIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M5 11h14v2H5z" />
    </svg>
  );
}

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
      />
    </svg>
  );
}

function CrownIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 17h14v2H5v-2Zm14-9-4.2 3.1L12 5 9.2 11.1 5 8l1.5 7h11L19 8Z"
      />
    </svg>
  );
}

function ZapIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13 2 3 14h8l-1 8 11-14h-8l0-6Z"
      />
    </svg>
  );
}

function UsersIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 11Zm8 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4ZM8 13c-2.6 0-5 1.2-5 3.3V19h5v-1.9c0-1.6.7-2.9 1.8-3.8A8 8 0 0 0 8 13Z"
      />
    </svg>
  );
}

export default TierComparisonModal;