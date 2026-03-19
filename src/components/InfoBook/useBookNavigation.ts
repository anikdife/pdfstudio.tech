import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BookTurnDirection = 'next' | 'prev' | null;

export type BookNavigationState = {
  currentPage: number;
  pendingPage: number | null;
  isTurning: boolean;
  direction: BookTurnDirection;
};

export type UseBookNavigationOptions = {
  open: boolean;
  pageCount: number;
  onClose: () => void;
  animationMs?: number;
  startPage?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Layout rules used by InfoBook:
// - Page 0 is the cover (single page view).
// - Interior is a two-page spread where `currentPage` is always the left page index.
// - For interior spreads, `currentPage` advances by 2.
export function useBookNavigation(options: UseBookNavigationOptions) {
  const { open, pageCount, onClose, animationMs = 760, startPage = 2 } = options;

  // Last valid index into BOOK_PAGES.
  const lastIndex = Math.max(0, pageCount - 1);

  // For interior spreads, the maximum left-page index.
  const maxInteriorLeft = useMemo(() => {
    const lastLeft = lastIndex % 2 === 0 ? lastIndex : lastIndex - 1;
    return Math.max(2, lastLeft);
  }, [lastIndex]);

  const [state, setState] = useState<BookNavigationState>({
    currentPage: 0,
    pendingPage: null,
    isTurning: false,
    direction: null,
  });

  const initializedForOpenRef = useRef(false);

  const turnTimerRef = useRef<number | null>(null);

  const clearTurnTimer = useCallback(() => {
    if (turnTimerRef.current != null) {
      window.clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTurnTimer();
  }, [clearTurnTimer]);

  // Reset to cover when book is closed.
  useEffect(() => {
    if (!open) {
      clearTurnTimer();
      initializedForOpenRef.current = false;
      setState({ currentPage: 0, pendingPage: null, isTurning: false, direction: null });
    }
  }, [open, clearTurnTimer]);

  // When opening, jump directly to the first interior spread (TOC by default) so the user sees content.
  useEffect(() => {
    if (!open) return;
    if (initializedForOpenRef.current) return;
    initializedForOpenRef.current = true;

    const raw = clamp(startPage, 0, lastIndex);
    if (raw <= 0) {
      setState({ currentPage: 0, pendingPage: null, isTurning: false, direction: null });
      return;
    }

    const normalizedLeft = raw < 2 ? 2 : raw % 2 === 0 ? raw : raw - 1;
    const nextCurrent = clamp(normalizedLeft, 2, maxInteriorLeft);
    setState({ currentPage: nextCurrent, pendingPage: null, isTurning: false, direction: null });
  }, [open, startPage, lastIndex, maxInteriorLeft]);

  const canPrev = state.currentPage !== 0 && !state.isTurning;
  const canNext = useMemo(() => {
    if (state.isTurning) return false;
    if (state.currentPage === 0) return pageCount > 2;
    return state.currentPage < maxInteriorLeft;
  }, [state.currentPage, state.isTurning, pageCount, maxInteriorLeft]);

  const commitTurn = useCallback(
    (nextCurrentPage: number) => {
      clearTurnTimer();
      turnTimerRef.current = window.setTimeout(() => {
        setState((prev) => ({
          currentPage: clamp(nextCurrentPage, 0, lastIndex),
          pendingPage: null,
          isTurning: false,
          direction: null,
        }));
        turnTimerRef.current = null;
      }, animationMs);
    },
    [animationMs, clearTurnTimer, lastIndex],
  );

  const nextPage = useCallback(() => {
    if (!canNext) return;

    if (state.currentPage === 0) {
      // Open straight to the first interior spread (left page index 2).
      const nextCurrent = clamp(2, 0, lastIndex);
      setState({ currentPage: 0, pendingPage: nextCurrent, isTurning: true, direction: 'next' });
      commitTurn(nextCurrent);
      return;
    }

    const nextCurrent = clamp(state.currentPage + 2, 2, maxInteriorLeft);
    setState({ currentPage: state.currentPage, pendingPage: nextCurrent, isTurning: true, direction: 'next' });
    commitTurn(nextCurrent);
  }, [canNext, state.currentPage, commitTurn, lastIndex, maxInteriorLeft]);

  const prevPage = useCallback(() => {
    if (!canPrev) return;

    if (state.currentPage <= 2) {
      // Close back to cover.
      setState({ currentPage: state.currentPage, pendingPage: 0, isTurning: true, direction: 'prev' });
      commitTurn(0);
      return;
    }

    const nextCurrent = clamp(state.currentPage - 2, 2, maxInteriorLeft);
    setState({ currentPage: state.currentPage, pendingPage: nextCurrent, isTurning: true, direction: 'prev' });
    commitTurn(nextCurrent);
  }, [canPrev, state.currentPage, commitTurn, maxInteriorLeft]);

  const goToPage = useCallback(
    (index: number) => {
      if (!open) return;
      if (state.isTurning) return;

      const raw = clamp(index, 0, lastIndex);
      if (raw <= 0) {
        setState({ currentPage: 0, pendingPage: null, isTurning: false, direction: null });
        return;
      }

      // For interior, normalize to the left page of the spread.
      const normalizedLeft = raw < 2 ? 2 : raw % 2 === 0 ? raw : raw - 1;
      const nextCurrent = clamp(normalizedLeft, 2, maxInteriorLeft);
      setState({ currentPage: nextCurrent, pendingPage: null, isTurning: false, direction: null });
    },
    [open, state.isTurning, lastIndex, maxInteriorLeft],
  );

  const closeBook = useCallback(() => {
    if (state.isTurning) return;
    onClose();
  }, [onClose, state.isTurning]);

  return {
    ...state,
    canPrev,
    canNext,
    nextPage,
    prevPage,
    goToPage,
    closeBook,
    animationMs,
  };
}
