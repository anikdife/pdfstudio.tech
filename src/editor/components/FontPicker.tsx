import React, { useEffect, useMemo, useRef, useState } from 'react';

type FontCategory = 'Standard' | 'Display' | 'Handwriting' | 'Regional' | 'System';

type FontEntry = {
  id: string;
  label: string;
  family: string;
  category: FontCategory;
  googleFamily?: string;
};

const RECENTS_KEY = 'xpdf.fontPicker.recents.v1';
const SYSTEM_TOGGLE_KEY = 'xpdf.fontPicker.showSystem.v1';

const FONT_LIBRARY: ReadonlyArray<FontEntry> = [
  // Standard
  { id: '"Times New Roman"', label: 'Times New Roman', family: '"Times New Roman"', category: 'Standard' },
  {
    id: '"Libre Baskerville"',
    label: 'Libre Baskerville',
    family: '"Libre Baskerville"',
    category: 'Standard',
    googleFamily: 'Libre Baskerville',
  },
  { id: 'Arial', label: 'Arial', family: 'Arial', category: 'Standard' },
  { id: 'Inter', label: 'Inter', family: 'Inter', category: 'Standard', googleFamily: 'Inter' },
  { id: 'Roboto', label: 'Roboto', family: 'Roboto', category: 'Standard', googleFamily: 'Roboto' },
  {
    id: '"Fira Code"',
    label: 'Fira Code',
    family: '"Fira Code"',
    category: 'Standard',
    googleFamily: 'Fira Code',
  },
  {
    id: '"Courier Prime"',
    label: 'Courier Prime',
    family: '"Courier Prime"',
    category: 'Standard',
    googleFamily: 'Courier Prime',
  },

  // Display
  {
    id: 'Montserrat',
    label: 'Montserrat',
    family: 'Montserrat',
    category: 'Display',
    googleFamily: 'Montserrat',
  },
  {
    id: '"Playfair Display"',
    label: 'Playfair Display',
    family: '"Playfair Display"',
    category: 'Display',
    googleFamily: 'Playfair Display',
  },
  { id: 'Oswald', label: 'Oswald', family: 'Oswald', category: 'Display', googleFamily: 'Oswald' },

  // Handwriting
  {
    id: '"Dancing Script"',
    label: 'Dancing Script',
    family: '"Dancing Script"',
    category: 'Handwriting',
    googleFamily: 'Dancing Script',
  },
  { id: 'Caveat', label: 'Caveat', family: 'Caveat', category: 'Handwriting', googleFamily: 'Caveat' },

  // Regional
  { id: 'nikosh', label: 'Nikosh', family: "'Nikosh', sans-serif", category: 'Regional' },

  // System (hidden by default)
  { id: 'sans-serif', label: 'System Sans', family: 'sans-serif', category: 'System' },
  { id: 'serif', label: 'System Serif', family: 'serif', category: 'System' },
  { id: 'monospace', label: 'System Mono', family: 'monospace', category: 'System' },
];

const loadedGoogleFamilies = new Set<string>();

function ensureLocalFontLoaded(fontId: string) {
  if (typeof document === 'undefined') return;
  if (fontId !== 'nikosh') return;

  const styleId = 'xpdf-font-nikosh';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
@font-face {
  font-family: 'Nikosh';
  src: url('/fonts/Nikosh%20400.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
`;
  document.head.appendChild(style);
}

function tryReadJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadGoogleFont(googleFamily: string) {
  if (typeof document === 'undefined') return;
  if (loadedGoogleFamilies.has(googleFamily)) return;
  loadedGoogleFamilies.add(googleFamily);

  const familyParam = encodeURIComponent(googleFamily).replace(/%20/g, '+');
  const href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;500;600;700&display=swap`;
  const id = `xpdf-google-font-${familyParam}`;

  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function getFontById(id: string | null | undefined): FontEntry | null {
  if (!id) return null;
  // Most fonts use `id` as the actual CSS `font-family` value, but some entries
  // (e.g. local/bundled fonts) may need to match by `family`.
  return FONT_LIBRARY.find((f) => f.id === id || f.family === id) ?? null;
}

function valueForEntry(entry: FontEntry): string {
  // The editor stores `font.family` and uses it directly as CSS `font-family`.
  // For Nikosh we want the stored value to be a usable CSS family string.
  return entry.id === 'nikosh' ? entry.family : entry.id;
}

function labelForValue(value: string | null): string {
  if (!value) return 'Font';
  return getFontById(value)?.label ?? value;
}

function previewFontFamily(value: string | null): string {
  const entry = getFontById(value);
  if (!entry) return value ?? 'inherit';

  if (entry.category === 'System') return entry.family;

  // Keep previews legible even before Google font loads.
  const fallback =
    entry.category === 'Handwriting'
      ? "cursive"
      : entry.category === 'Display'
        ? "ui-serif, Georgia, serif"
        : "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  // `entry.family` is already CSS-safe (quotes included where needed).
  return `${entry.family}, ${fallback}`;
}

function readRecents(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const list = tryReadJson<string[]>(localStorage.getItem(RECENTS_KEY));
  if (!Array.isArray(list)) return [];
  return list.filter((x) => typeof x === 'string');
}

function writeRecents(next: string[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next.slice(0, 3)));
}

function readShowSystem(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(SYSTEM_TOGGLE_KEY);
  return raw === '1';
}

function writeShowSystem(next: boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SYSTEM_TOGGLE_KEY, next ? '1' : '0');
}

export function FontPicker(props: { value: string | null; onSelect: (fontId: string) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showSystemFonts, setShowSystemFonts] = useState(() => readShowSystem());
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const [panelMaxHeight, setPanelMaxHeight] = useState<number>(420);

  // Load Google font when the controlled value changes.
  useEffect(() => {
    const entry = getFontById(props.value);
    if (!entry) return;
    if (entry.id === 'nikosh') ensureLocalFontLoaded('nikosh');
    if (entry.googleFamily) loadGoogleFont(entry.googleFamily);
  }, [props.value]);

  const visibleLibrary = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const base = FONT_LIBRARY.filter((f) => (showSystemFonts ? true : f.category !== 'System'));
    if (!normalized) return base;
    return base.filter((f) => {
      const labelMatch = f.label.toLowerCase().includes(normalized);
      const catMatch = f.category.toLowerCase().includes(normalized);
      return labelMatch || catMatch;
    });
  }, [query, showSystemFonts]);

  const grouped = useMemo(() => {
    const byCat: Record<FontCategory, FontEntry[]> = {
      Standard: [],
      Display: [],
      Handwriting: [],
      Regional: [],
      System: [],
    };
    for (const f of visibleLibrary) byCat[f.category].push(f);

    const ordered: Array<{ key: string; title: string; items: FontEntry[] }> = [];

    const recentItems = recents
      .map((id) =>
        getFontById(id) ?? (id ? ({ id, label: id, family: id, category: 'Standard' as const } as FontEntry) : null)
      )
      .filter(Boolean) as FontEntry[];

    if (open && recentItems.length > 0 && query.trim().length === 0) {
      ordered.push({ key: 'recent', title: 'Recently Used', items: recentItems.slice(0, 3) });
    }

    for (const cat of ['Standard', 'Display', 'Handwriting', 'Regional', 'System'] as const) {
      if (byCat[cat].length === 0) continue;
      ordered.push({ key: cat, title: cat, items: byCat[cat] });
    }

    return ordered;
  }, [visibleLibrary, recents, open, query]);

  const flatItems = useMemo(() => {
    const out: FontEntry[] = [];
    for (const section of grouped) {
      for (const item of section.items) out.push(item);
    }
    return out;
  }, [grouped]);

  // Progressive loading for previews: load the currently active option while browsing.
  useEffect(() => {
    if (!open) return;

    setHoveredId(null);
    const entry = flatItems[activeIndex];
    if (entry?.id === 'nikosh') ensureLocalFontLoaded('nikosh');
    if (entry?.googleFamily) loadGoogleFont(entry.googleFamily);
  }, [open, activeIndex, flatItems]);

  function closeAndFocus() {
    setOpen(false);
    setQuery('');
    window.setTimeout(() => {
      const btn = anchorRef.current;
      if (!btn) return;
      try {
        // Avoid scrolling the right panel when restoring focus.
        btn.focus({ preventScroll: true } as any);
      } catch {
        btn.focus();
      }
    }, 0);
  }

  function updatePanelGeometry() {
    const anchor = anchorRef.current;
    if (!anchor) return;

    // Constrain the dropdown to the Properties panel viewport if present.
    const container = (anchor.closest('.propsPanel') ?? anchor.closest('.rightPanel')) as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();

    const topBound = containerRect ? containerRect.top : 0;
    const bottomBound = containerRect ? containerRect.bottom : window.innerHeight;

    const padding = 10;
    const below = bottomBound - anchorRect.bottom - padding;
    const above = anchorRect.top - topBound - padding;

    const nextOpenUp = below < 260 && above > below;
    setOpenUp(nextOpenUp);

    const available = Math.max(180, nextOpenUp ? above : below);
    // Clamp max height so it doesn't become huge on tall panels.
    setPanelMaxHeight(Math.min(520, available));
  }

  useEffect(() => {
    if (!open) return;
    updatePanelGeometry();

    const anchor = anchorRef.current;
    const container = (anchor?.closest('.propsPanel') ?? anchor?.closest('.rightPanel')) as HTMLElement | null;
    const onResize = () => updatePanelGeometry();
    const onScroll = () => updatePanelGeometry();
    window.addEventListener('resize', onResize);
    container?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      container?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Initialize active index.
    const selectedIdx = flatItems.findIndex((f) => f.id === props.value);
    setActiveIndex(Math.max(0, selectedIdx >= 0 ? selectedIdx : 0));

    const t = window.setTimeout(() => {
      const input = searchRef.current;
      if (!input) return;
      try {
        // Avoid scrolling the props panel on focus.
        input.focus({ preventScroll: true } as any);
      } catch {
        input.focus();
      }
      input.select();
    }, 0);

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const inRoot = !!rootRef.current?.contains(target);
      if (!inRoot) closeAndFocus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAndFocus();
        return;
      }

      if (flatItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter') {
        // Don’t trigger when IME composing.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyE = e as any;
        if (anyE.isComposing) return;
        e.preventDefault();
        const entry = flatItems[activeIndex];
        if (entry) handleSelect(entry);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatItems.length, activeIndex, props.value]);

  useEffect(() => {
    if (!open) return;
    if (hoveredId) return;
    const entry = flatItems[activeIndex];
    if (!entry) return;

    // Scroll only inside the dropdown list so the surrounding layout doesn't jump.
    const list = panelRef.current?.querySelector('.fontPickerList') as HTMLElement | null;
    const el = panelRef.current?.querySelector(`[data-font-option="${CSS.escape(entry.id)}"]`) as HTMLElement | null;
    if (!list || !el) return;

    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;

    if (top < viewTop) list.scrollTop = top;
    else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, open, flatItems]);

  function handleSelect(entry: FontEntry) {
    if (entry.id === 'nikosh') ensureLocalFontLoaded('nikosh');
    if (entry.googleFamily) loadGoogleFont(entry.googleFamily);

    const value = valueForEntry(entry);

    // Update recents.
    const next = [value, ...recents.filter((x) => x !== value)].slice(0, 3);
    setRecents(next);
    writeRecents(next);

    props.onSelect(value);
    closeAndFocus();
  }

  const selectedLabel = labelForValue(props.value);
  const selectedFamily = previewFontFamily(props.value);
  const listboxId = useMemo(() => `fontpicker-${Math.random().toString(16).slice(2)}`, []);

  return (
    <div ref={rootRef} className="fontPickerRoot">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="fontPickerButton"
      >
        <span className="fontPickerButtonLabel" style={{ fontFamily: selectedFamily }} title={selectedLabel}>
          {selectedLabel}
        </span>
        <svg
          className="fontPickerChevron"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          className={openUp ? 'fontPickerPanel openUp' : 'fontPickerPanel'}
          style={{ width: 360, maxWidth: 'calc(100vw - 24px)', maxHeight: panelMaxHeight }}
        >
          <div className="fontPickerPanelHeader">
            <div className="fontPickerSearchWrap">
              <svg
                className="fontPickerSearchIcon"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.5 3.75a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5ZM2.25 8.5a6.25 6.25 0 1 1 11.14 3.9l3.36 3.35a.75.75 0 1 1-1.06 1.06l-3.35-3.36A6.25 6.25 0 0 1 2.25 8.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fonts"
                className="fontPickerSearchInput"
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Font picker"
            className="fontPickerList"
            style={{ maxHeight: Math.max(140, panelMaxHeight - 120) }}
          >
            {grouped.length === 0 ? (
              <div className="fontPickerEmpty">No fonts found.</div>
            ) : (
              grouped.map((section) => (
                <div key={section.key} className="fontPickerSection">
                  <div className="fontPickerSectionHeader">
                    {section.title}
                  </div>
                  <div className="fontPickerSectionBody">
                    {section.items.map((entry) => {
                      const entryValue = valueForEntry(entry);
                      const isSelected = props.value === entryValue;
                      const isActive = hoveredId ? hoveredId === entry.id : flatItems[activeIndex]?.id === entry.id;
                      const itemFont = previewFontFamily(entry.id);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-font-option={entry.id}
                          onMouseEnter={() => {
                            setHoveredId(entry.id);
                            if (entry.id === 'nikosh') ensureLocalFontLoaded('nikosh');
                            if (entry.googleFamily) loadGoogleFont(entry.googleFamily);
                          }}
                          onMouseLeave={() => setHoveredId(null)}
                          onClick={() => handleSelect(entry)}
                          className={
                            'fontPickerOption' +
                            (isSelected ? ' selected' : '') +
                            (!isSelected && isActive ? ' active' : '')
                          }
                        >
                          <div className="fontPickerOptionText">
                            <div className="fontPickerOptionLabel" style={{ fontFamily: itemFont }}>
                              {entry.label}
                            </div>
                            <div className="fontPickerOptionMeta">{entry.category}</div>
                          </div>

                          {isSelected ? (
                            <svg
                              className="fontPickerCheck"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.75 7.78a1 1 0 0 1-1.42 0L3.29 10.2a1 1 0 1 1 1.42-1.4l3.12 3.15 7.04-7.07a1 1 0 0 1 1.414-.006Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="fontPickerFooter">
            <label className="fontPickerToggleRow">
              <span>Use system fonts</span>
              <input
                type="checkbox"
                checked={showSystemFonts}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowSystemFonts(next);
                  writeShowSystem(next);
                }}
                className="fontPickerToggle"
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
