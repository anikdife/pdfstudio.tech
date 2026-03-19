import { useEffect, useMemo, useState } from 'react';

type Props = {
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HomeSummaryTyper(props: Props) {
  const lines = useMemo(
    () => [
      'Pages: resize, rotate, crop, reorder, split, merge, extract',
      'Image: insert, mask shapes, crop, transforms, filters',
      'Text: add, edit, style, move, resize',
      'Ink & Highlight: draw strokes and highlights',
      'List: bullets, numbers, checkboxes, indent, edit',
    ],
    [],
  );

  const reduced = useMemo(() => prefersReducedMotion(), []);

  const [lineIndex, setLineIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;

    const wordsByLine = lines.map((l) => l.split(/\s+/).filter(Boolean));

    const WORD_MS = 110;
    const LINE_PAUSE_MS = 700;
    const END_PAUSE_MS = 1200;

    let timer: number | null = null;

    const tick = () => {
      const currentWords = wordsByLine[lineIndex] ?? [];

      // Advance word-by-word.
      if (wordIndex < currentWords.length) {
        setWordIndex((w) => w + 1);
        timer = window.setTimeout(tick, WORD_MS);
        return;
      }

      // Line completed: move to next line.
      if (lineIndex < wordsByLine.length - 1) {
        timer = window.setTimeout(() => {
          setLineIndex((i) => i + 1);
          setWordIndex(0);
        }, LINE_PAUSE_MS);
        return;
      }

      // All lines completed: restart.
      timer = window.setTimeout(() => {
        setLineIndex(0);
        setWordIndex(0);
      }, END_PAUSE_MS);
    };

    timer = window.setTimeout(tick, WORD_MS);

    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [lines, lineIndex, wordIndex, reduced]);

  const renderedLines = useMemo(() => {
    if (reduced) return lines;

    return lines.map((l, idx) => {
      if (idx < lineIndex) return l;
      if (idx > lineIndex) return '';
      const words = l.split(/\s+/).filter(Boolean);
      return words.slice(0, Math.max(0, wordIndex)).join(' ');
    });
  }, [lines, lineIndex, wordIndex, reduced]);

  return (
    <div className={props.className ? `homeSummaryTyper ${props.className}` : 'homeSummaryTyper'} aria-label="Feature summary">
      <div className="homeSummaryTitle">Features</div>
      <div className="homeSummaryBody">
        {renderedLines.map((text, idx) => {
          const isActive = !reduced && idx === lineIndex;
          const showCursor = isActive && text.length > 0;
          return (
            <div key={`sum-${idx}`} className={isActive ? 'homeSummaryLine active' : 'homeSummaryLine'}>
              <span>{text}</span>
              {showCursor ? <span className="homeSummaryCursor" aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
