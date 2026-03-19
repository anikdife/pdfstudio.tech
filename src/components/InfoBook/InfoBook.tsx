import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './InfoBook.css';
import './animations.css';

import { BOOK_PAGES, BOOK_PAGE_COUNT, InfoBookNavContext } from './bookPages';
import { useBookNavigation } from './useBookNavigation';
import { Logo } from '../../app/logo';

export type InfoBookProps = {
  open: boolean;
  onClose: () => void;
};

function BlankPage() {
  return (
    <div className="infoBook-pageContent">
      <div className="infoBook-pageH1" style={{ opacity: 0.15 }} />
    </div>
  );
}

function PageSlot(props: { index: number; side: 'left' | 'right'; visibleIndices: Set<number> }) {
  const { index, visibleIndices } = props;
  const isVisible = visibleIndices.has(index);

  if (!isVisible) return <BlankPage />;

  const def = BOOK_PAGES[index];
  if (!def) return <BlankPage />;

  return <Suspense fallback={<div className="infoBook-loading">Loading…</div>}>{def.render()}</Suspense>;
}

function clampIndex(index: number) {
  return Math.max(0, Math.min(index, BOOK_PAGE_COUNT - 1));
}

export function InfoBook(props: InfoBookProps) {
  const { open, onClose } = props;

  const [shouldRender, setShouldRender] = useState(open);
  const [closing, setClosing] = useState(false);

  const {
    currentPage,
    pendingPage,
    isTurning,
    direction,
    canPrev,
    canNext,
    prevPage,
    nextPage,
    goToPage,
    closeBook,
  } = useBookNavigation({ open, pageCount: BOOK_PAGE_COUNT, onClose, startPage: 0 });

  // Mount/unmount with smooth close animation.
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setClosing(false);
      return;
    }

    if (!shouldRender) return;

    setClosing(true);
    const t = window.setTimeout(() => {
      setShouldRender(false);
      setClosing(false);
    }, 190);

    return () => window.clearTimeout(t);
  }, [open, shouldRender]);

  // Lock body scrolling only while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Simple edge drag-to-flip (optional): threshold-based.
  const dragRef = useRef<{ startX: number; edge: 'left' | 'right' } | null>(null);

  const onEdgePointerDown = (edge: 'left' | 'right') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, edge };
  };

  const onEdgePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const threshold = 70;

    if (drag.edge === 'right') {
      // Drag left to go next.
      if (dx < -threshold) nextPage();
    } else {
      // Drag right to go prev.
      if (dx > threshold) prevPage();
    }
  };

  const onBackdropMouseDown = () => {
    if (!open) return;
    closeBook();
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const normalizedCurrent = useMemo(() => clampIndex(currentPage), [currentPage]);
  const normalizedPending = useMemo(() => (pendingPage == null ? null : clampIndex(pendingPage)), [pendingPage]);

  const isCoverView = normalizedCurrent === 0 && (normalizedPending == null || normalizedPending === 0);

  const currentLeft = isCoverView ? 0 : normalizedCurrent;
  const currentRight = isCoverView ? 0 : clampIndex(normalizedCurrent + 1);

  const destLeft = normalizedPending == null ? currentLeft : normalizedPending;
  const destRight = clampIndex(destLeft + 1);

  const visibleIndices = useMemo(() => {
    const indices = new Set<number>();

    if (isCoverView) {
      indices.add(0);
      return indices;
    }

    // Always render current spread.
    indices.add(currentLeft);
    indices.add(currentRight);

    // When turning, also render destination spread.
    if (isTurning && normalizedPending != null) {
      indices.add(destLeft);
      indices.add(destRight);
    } else {
      // Otherwise pre-render prev/next single pages around the spread.
      indices.add(clampIndex(currentLeft - 1));
      indices.add(clampIndex(currentRight + 1));
    }

    return indices;
  }, [isCoverView, currentLeft, currentRight, isTurning, normalizedPending, destLeft, destRight]);

  if (!shouldRender) return null;

  const prevDisabled = !canPrev;
  const nextDisabled = !canNext;

  const renderPaperPage = (index: number, side: 'left' | 'right') => {
    // Cover (0) is rendered separately. We hide numbering for the cover + preface spread.
    // This makes the TOC spread start at page 3 (index 4 -> 3), matching the book text.
    const printedPage = index >= 4 ? index - 1 : null;

    return (
      <div className={`infoBook-page infoBook-paper infoBook-${side}`}>
        <div className="infoBook-watermark" aria-hidden="true">
          <Logo className="infoBook-watermarkSvg" showWordmark={false} />
        </div>
        {index >= 0 && index < BOOK_PAGE_COUNT ? (
          <PageSlot index={index} side={side} visibleIndices={visibleIndices} />
        ) : (
          <BlankPage />
        )}
        {printedPage != null ? (
          <div className={`infoBook-pageFooter infoBook-pageFooter-${side}`} aria-hidden="true">
            {printedPage}
          </div>
        ) : null}
      </div>
    );
  };

  const renderCoverOnly = () => (
    <div className="infoBook-spread" aria-hidden={false}>
      <div style={{ gridColumn: '1 / span 2', position: 'relative' }}>
        <Suspense fallback={<div className="infoBook-loading">Loading…</div>}>
          {BOOK_PAGES[0].render()}
        </Suspense>
      </div>
    </div>
  );

  const renderInterior = () => {
    // Static pages
    const leftStaticIndex = isTurning && direction === 'prev' ? destLeft : currentLeft;
    const rightStaticIndex = isTurning && direction === 'next' ? destRight : currentRight;

    // Turning page content
    const turnerFrontIndex = direction === 'next' ? currentRight : currentLeft;
    const turnerBackIndex = direction === 'next' ? destLeft : destRight;

    const showTurner = isTurning && direction != null && normalizedPending != null;

    return (
      <div className="infoBook-spread">
        {renderPaperPage(leftStaticIndex, 'left')}
        {renderPaperPage(rightStaticIndex, 'right')}

        <div className="infoBook-gutter" aria-hidden="true" />

        {showTurner ? (
          <div className={`infoBook-pageTurner ${direction === 'next' ? 'infoBook-turnNext' : 'infoBook-turnPrev'}`}>
            <div className="infoBook-pageFace infoBook-front">
              {renderPaperPage(turnerFrontIndex, direction === 'next' ? 'right' : 'left')}
            </div>
            <div className="infoBook-pageFace infoBook-back">
              {renderPaperPage(turnerBackIndex, direction === 'next' ? 'left' : 'right')}
            </div>
          </div>
        ) : null}

        <div
          className="infoBook-edge infoBook-edgeLeft"
          onClick={() => prevPage()}
          onPointerDown={onEdgePointerDown('left')}
          onPointerUp={onEdgePointerUp}
          aria-hidden="true"
        />
        <div
          className="infoBook-edge infoBook-edgeRight"
          onClick={() => nextPage()}
          onPointerDown={onEdgePointerDown('right')}
          onPointerUp={onEdgePointerUp}
          aria-hidden="true"
        />
      </div>
    );
  };

  const overlay = (
    <div className={`infoBook-backdrop ${open ? '' : 'infoBook-closed'}`} onMouseDown={onBackdropMouseDown}>
      <div className={`infoBook-container ${closing ? 'infoBook-closing' : ''}`} onMouseDown={stop} role="dialog" aria-modal="true">
        <button type="button" className="infoBook-close" onClick={closeBook} aria-label="Close info book">
          ×
        </button>

        <button
          type="button"
          className={`infoBook-arrow infoBook-leftArrow ${prevDisabled ? 'infoBook-arrowDisabled' : ''}`}
          onMouseDown={stop}
          onClick={() => {
            if (prevDisabled) return;
            prevPage();
          }}
          aria-disabled={prevDisabled}
          aria-label="Previous pages"
        >
          ‹
        </button>
        <button
          type="button"
          className={`infoBook-arrow infoBook-rightArrow ${nextDisabled ? 'infoBook-arrowDisabled' : ''}`}
          onMouseDown={stop}
          onClick={() => {
            if (nextDisabled) return;
            nextPage();
          }}
          aria-disabled={nextDisabled}
          aria-label="Next pages"
        >
          ›
        </button>

        <InfoBookNavContext.Provider value={{ goToPage }}>
          <div className="infoBook-book">{isCoverView ? renderCoverOnly() : renderInterior()}</div>
        </InfoBookNavContext.Provider>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
