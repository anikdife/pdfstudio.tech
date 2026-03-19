import React from 'react';
import { Logo } from '../../app/logo';

export type BookPageDef = {
  id: string;
  title: string;
  render: () => React.ReactElement;
  tocHidden?: boolean;
};

export const InfoBookNavContext = React.createContext<{ goToPage: (index: number) => void }>({
  goToPage: () => {},
});

// Lazy wrapper that still works without creating extra files.
// This satisfies the React.lazy + Suspense usage, and keeps InfoBook isolated.
const lazyInline = <P,>(Component: React.ComponentType<P>) =>
  React.lazy(async () => ({ default: Component as React.ComponentType<any> }));

function PageShell(props: { title: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="infoBook-pageContent">
      <header className="infoBook-pageHeader">
        <div className="infoBook-pageH1">{props.title}</div>
        {props.subtitle ? <div className="infoBook-pageSub">{props.subtitle}</div> : null}
        <div className="infoBook-pageOrnament" aria-hidden="true" />
      </header>
      <div className="infoBook-pageBody">{props.children}</div>
    </div>
  );
}

function BlankCreamContent() {
  return <div className="infoBook-pageContent" />;
}

function Icon(props: { name: 'compass' | 'layers' | 'pages' | 'text' | 'pen' | 'cloud' | 'lock' | 'keyboard' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className: 'infoBook-icon',
  } as const;

  switch (props.name) {
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
          <path d="M14.8 9.2l-2 5.6-5.6 2 2-5.6 5.6-2z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 12l9 5 9-5" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
        </svg>
      );
    case 'pages':
      return (
        <svg {...common}>
          <path d="M7 4h8l3 3v13H7V4z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 4v4h4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 12h7M9 15h7" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
        </svg>
      );
    case 'text':
      return (
        <svg {...common}>
          <path d="M5 6h14M12 6v14" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'pen':
      return (
        <svg {...common}>
          <path d="M4 20l4.5-1 10-10-3.5-3.5-10 10L4 20z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...common}>
          <path
            d="M7.5 18h9.2a4.3 4.3 0 0 0 .4-8.6A5.6 5.6 0 0 0 6.4 10.7 3.8 3.8 0 0 0 7.5 18z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <path d="M7.5 11V9a4.5 4.5 0 0 1 9 0v2" stroke="currentColor" strokeWidth="1.6" />
          <rect x="6" y="11" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'keyboard':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 10h.5M9.5 10h.5M12 10h.5M14.5 10h.5M17 10h.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 14h10" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
        </svg>
      );
  }
}

const CoverPage = () => (
  <div className="infoBook-coverSpread">
    {/* PAGE 1 — COVER (Left): blank cream paper */}
    <div className="infoBook-coverBlank">
      <div className="infoBook-watermark infoBook-watermarkCover" aria-hidden="true">
        <Logo className="infoBook-watermarkSvg" showWordmark={false} />
      </div>
    </div>

    {/* PAGE 1 — COVER (Right): tech-magazine cover */}
    <div className="infoBook-cover">
      <div className="infoBook-watermark infoBook-watermarkCover" aria-hidden="true">
        <Logo className="infoBook-watermarkSvg" showWordmark={false} />
      </div>
      <div className="infoBook-coverInner">
        <div className="infoBook-coverCenter">
          <div className="infoBook-coverTitle infoBook-coverTitleMetal">pdfstudio</div>
          <div className="infoBook-coverGlint" aria-hidden="true" />
          <div className="infoBook-coverTag">Your Modern, Private, Cloud-Connected PDF Workspace</div>
        </div>
        <div className="infoBook-coverFooter">
          <div className="infoBook-coverByline">designed by sales@pdfstudio.tech</div>
          <div className="infoBook-coverHint">Click the right edge to open</div>
        </div>
      </div>
      <div className="infoBook-coverCorners" aria-hidden="true" />
    </div>
  </div>
);

// Index 1 is unreachable in the current book navigation model (interior spreads start at index 2).
// We keep a placeholder page to preserve index parity.
const UnusedIndexSpacer = () => <BlankCreamContent />;

// PAGE 2 — PREFACE (Left)
const PrefaceLeftPage = () => (
  <div className="infoBook-pageContent infoBook-verticalCenter">
    <header className="infoBook-pageHeader">
      <div className="infoBook-pageH1">Preface</div>
      <div className="infoBook-pageOrnament" aria-hidden="true" />
    </header>
    <div className="infoBook-pageBody">
      <p>
        <span className="infoBook-dropcap">W</span>
        elcome to pdfstudio — a modern PDF editor designed with a simple mission: give you full control over your
        documents — your way.
      </p>
      <p>
        Every feature works directly inside your browser, with no installation, no uploads, and no hidden processing.
      </p>
      <p>Your PDFs stay on your device unless you choose to save them to Google Drive.</p>
    </div>
  </div>
);

// PAGE 2 — PREFACE (Right)
const PrefaceRightPage = () => (
  <div className="infoBook-pageContent">
    <header className="infoBook-pageHeader">
      <div className="infoBook-pageH1">Mission</div>
      <div className="infoBook-pageSub">Welcoming, warm, and local-first</div>
      <div className="infoBook-pageOrnament" aria-hidden="true" />
    </header>

    <div className="infoBook-illustrationCard">
      <div className="infoBook-illustrationScene" aria-hidden="true">
        <div className="infoBook-illusLaptop" />
        <div className="infoBook-illusPdf" />
        <div className="infoBook-illusPdf infoBook-illusPdf2" />
        <div className="infoBook-illusCloud" />
        <div className="infoBook-illusLock" />
      </div>
      <div className="infoBook-caption">Laptop + floating PDFs + Cloud + Lock (privacy-first)</div>
    </div>

    <div className="infoBook-pageBody">
      <p>
        This book is your guide. Flip through each chapter to discover tools, workflows, and the vision behind
        pdfstudio.
      </p>
      <div className="infoBook-callout">Let’s begin.</div>
    </div>
  </div>
);

// PAGES 3–4 — TABLE OF CONTENTS
type TocEntry = { id: string; title: string; icon: React.ReactNode; targetLeftIndex: number; pageNumberLabel: string };

const TOC_ENTRIES: TocEntry[] = [
  { id: 'ch1', title: 'Getting Started', icon: <Icon name="compass" />, targetLeftIndex: 6, pageNumberLabel: '5–6' },
  { id: 'ch2', title: 'Interface Overview', icon: <Icon name="layers" />, targetLeftIndex: 8, pageNumberLabel: '7–8' },
  { id: 'ch3', title: 'Page Management', icon: <Icon name="pages" />, targetLeftIndex: 10, pageNumberLabel: '9–10' },
  { id: 'ch4', title: 'Text & List Tools', icon: <Icon name="text" />, targetLeftIndex: 12, pageNumberLabel: '11–12' },
  { id: 'ch5', title: 'Images & Shapes', icon: <Icon name="layers" />, targetLeftIndex: 14, pageNumberLabel: '13–14' },
  { id: 'ch6', title: 'Annotations & Highlights', icon: <Icon name="pen" />, targetLeftIndex: 16, pageNumberLabel: '15–16' },
  { id: 'ch7', title: 'Exporting & Saving', icon: <Icon name="pages" />, targetLeftIndex: 18, pageNumberLabel: '17–18' },
  { id: 'ch8', title: 'Google Drive Sync', icon: <Icon name="cloud" />, targetLeftIndex: 20, pageNumberLabel: '19–20' },
  { id: 'ch9', title: 'Local-Only Privacy', icon: <Icon name="lock" />, targetLeftIndex: 22, pageNumberLabel: '21–22' },
  { id: 'ch10', title: 'Shortcuts & Efficiency', icon: <Icon name="keyboard" />, targetLeftIndex: 24, pageNumberLabel: '23–24' },
  { id: 'credits', title: 'Credits & Appreciation', icon: <Icon name="pages" />, targetLeftIndex: 26, pageNumberLabel: '25–26' },
];

const TableOfContentsLeftPage = () => {
  const nav = React.useContext(InfoBookNavContext);
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div className="infoBook-pageContent">
      <div className="infoBook-tocRail" aria-hidden="true" />
      <header className="infoBook-pageHeader">
        <div className="infoBook-pageH1">Table of Contents</div>
        <div className="infoBook-pageSub">Index</div>
        <div className="infoBook-pageOrnament" aria-hidden="true" />
      </header>

      <div className="infoBook-tocList">
        {TOC_ENTRIES.map((e, idx) => (
          <button
            key={e.id}
            type="button"
            className={`infoBook-tocRow ${selected === e.id ? 'infoBook-tocRowSelected' : ''}`}
            onClick={() => {
              setSelected(e.id);
              nav.goToPage(e.targetLeftIndex);
            }}
          >
            <span className="infoBook-tocIndex">{idx + 1}.</span>
            <span className="infoBook-tocText">{e.title}</span>
            <span className="infoBook-tocPageMono">{e.pageNumberLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const TableOfContentsRightPage = () => {
  const nav = React.useContext(InfoBookNavContext);
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div className="infoBook-pageContent">
      <header className="infoBook-pageHeader">
        <div className="infoBook-pageH1">Contents</div>
        <div className="infoBook-pageSub">Tap an entry to jump</div>
        <div className="infoBook-pageOrnament" aria-hidden="true" />
      </header>

      <div className="infoBook-tocList">
        {TOC_ENTRIES.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`infoBook-tocRow infoBook-tocRowIcon ${selected === e.id ? 'infoBook-tocRowSelected' : ''}`}
            onClick={() => {
              setSelected(e.id);
              nav.goToPage(e.targetLeftIndex);
            }}
          >
            <span className="infoBook-tocIcon" aria-hidden="true">
              {e.icon}
            </span>
            <span className="infoBook-tocText">{e.title}</span>
            <span className="infoBook-tocPageMono">{e.pageNumberLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// PAGES 5–6 — CHAPTER 1
const Chapter1LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 1 — Getting Started</div>
    <div className="infoBook-heroIllustration">Illustration: Opening a PDF window</div>

    <div className="infoBook-twoCol">
      <div>
        <div className="infoBook-sectionTitle">Opening a PDF</div>
        <div className="infoBook-blueUnderline" />
        <div className="infoBook-line"><span className="infoBook-lineDot" />Open file (local)</div>
        <div className="infoBook-line"><span className="infoBook-lineDot" />Nothing is uploaded</div>

        <div className="infoBook-sectionTitle" style={{ marginTop: 12 }}>Creating a New Document</div>
        <div className="infoBook-blueUnderline" />
        <div className="infoBook-line"><span className="infoBook-lineDot" />Blank document</div>
        <div className="infoBook-line"><span className="infoBook-lineDot" />Pick page size</div>
      </div>
      <div>
        <div className="infoBook-sectionTitle">Basic Navigation</div>
        <div className="infoBook-blueUnderline" />
        <div className="infoBook-line"><span className="infoBook-lineDot" />Zoom in / out</div>
        <div className="infoBook-line"><span className="infoBook-lineDot" />Scroll pages</div>
        <div className="infoBook-line"><span className="infoBook-lineDot" />Thumbnails jump</div>
      </div>
    </div>
  </div>
);

const Chapter1RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Flow</div>
    <div className="infoBook-stepCards">
      <div className="infoBook-stepCard infoBook-stepCardA">Open →</div>
      <div className="infoBook-stepCard infoBook-stepCardB">Editor →</div>
      <div className="infoBook-stepCard infoBook-stepCardC">Export</div>
    </div>
    <div className="infoBook-miniThumbs">
      <div className="infoBook-miniThumb" />
      <div className="infoBook-miniThumb" />
      <div className="infoBook-miniThumb" />
    </div>
    <div className="infoBook-pageBody">
      <p>
        <b>Open</b> a PDF from your device (or from Drive if you connect it). pdfstudio loads it into an editor workspace
        designed for fast, precise changes.
      </p>
      <ul>
        <li>
          <b>Edit</b> using tools like text, lists, shapes, image masks, highlights, and ink.
        </li>
        <li>
          <b>Manage pages</b>: reorder, rotate, crop, insert, split, merge, or extract pages.
        </li>
        <li>
          <b>Export</b> when you’re ready: download a new PDF locally, or optionally save back to Google Drive.
        </li>
      </ul>
      <div className="infoBook-callout">Tip: nothing leaves your browser unless you choose Drive.</div>
    </div>
    <div className="infoBook-caption">Step-by-step cards in pastel boxes</div>
  </div>
);

// PAGES 7–8 — CHAPTER 2
const Chapter2LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 2 — Interface Overview</div>
    <div className="infoBook-diagramWide">
      <div className="infoBook-diagramLabel">Top bar</div>
      <div className="infoBook-diagramCanvas">
        <div className="infoBook-diagramThumbs">Thumbnail bar</div>
        <div className="infoBook-diagramMain">Canvas area</div>
        <div className="infoBook-diagramProps">Properties panel</div>
      </div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        The editor is organized into four zones so you can work without hunting for controls.
      </p>
      <ul>
        <li>
          <b>Top bar:</b> document actions, page operations, export, and optional Drive actions.
        </li>
        <li>
          <b>Thumbnails:</b> jump to pages, reorder via drag, and select page ranges quickly.
        </li>
        <li>
          <b>Canvas:</b> the active page—place and edit objects with precision.
        </li>
        <li>
          <b>Properties:</b> context-aware styling (fonts, colors, size, alignment, strokes, opacity, layers).
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Diagram of the editor layout</div>
  </div>
);

const Chapter2RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Feature Cards</div>
    <div className="infoBook-featureGrid">
      <div className="infoBook-featureCard">Top Toolbar</div>
      <div className="infoBook-featureCard">Thumbnails</div>
      <div className="infoBook-featureCard">Canvas</div>
      <div className="infoBook-featureCard">Properties</div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        Every panel is designed to stay out of your way until you need it.
      </p>
      <ul>
        <li>
          Use the <b>tool picker</b> to switch between selection, text, lists, ink, and highlights.
        </li>
        <li>
          Select any object to reveal <b>only the properties that matter</b>.
        </li>
        <li>
          Keep layout clean with <b>layers/order</b> controls (bring forward / send backward).
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Cards with slight shadows + icons (scaffold)</div>
  </div>
);

// PAGES 9–10 — CHAPTER 3
const Chapter3LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 3 — Page Management</div>
    <div className="infoBook-centerStage">
      <div className="infoBook-pageThumbBig" />
      <div className="infoBook-reorderArrows" aria-hidden="true">⇅</div>
      <div className="infoBook-gestureRow">
        <span className="infoBook-gesture">drag</span>
        <span className="infoBook-gesture">drop</span>
      </div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        Pages are first-class in pdfstudio. You can restructure a document in seconds.
      </p>
      <ul>
        <li>
          <b>Reorder</b> by dragging thumbnails.
        </li>
        <li>
          <b>Insert</b> blank pages or add pages from images.
        </li>
        <li>
          <b>Rotate</b> pages for scans and sideways documents.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Thumbnail diagram + reorder gesture</div>
  </div>
);

const Chapter3RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Before / After</div>
    <div className="infoBook-beforeAfterGrid">
      <div className="infoBook-beforeAfter">
        <div className="infoBook-beforeAfterLabel">Crop</div>
        <div className="infoBook-beforeAfterSteps">
          <span>1</span><span>→</span><span>2</span><span>→</span><span>3</span>
        </div>
      </div>
      <div className="infoBook-beforeAfter">
        <div className="infoBook-beforeAfterLabel">Rotate</div>
        <div className="infoBook-beforeAfterSteps">
          <span>1</span><span>→</span><span>2</span><span>→</span><span>3</span>
        </div>
      </div>
      <div className="infoBook-beforeAfter">
        <div className="infoBook-beforeAfterLabel">Insert</div>
        <div className="infoBook-beforeAfterSteps">
          <span>1</span><span>→</span><span>2</span><span>→</span><span>3</span>
        </div>
      </div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        The page tools focus on predictable results:
      </p>
      <ul>
        <li>
          <b>Crop:</b> select a region and apply; re-open crop if you need to refine.
        </li>
        <li>
          <b>Split / Extract:</b> choose ranges (like <code>1-3, 8, 10-12</code>) and export a new file.
        </li>
        <li>
          <b>Merge:</b> combine PDFs into one document without leaving the editor.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Clean step labels + visual balance</div>
  </div>
);

// PAGES 11–12 — CHAPTER 4
const Chapter4LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 4 — Text & List Tools</div>
    <div className="infoBook-textboxMock">
      <div className="infoBook-textboxHandle" />
      <div className="infoBook-textboxHandle infoBook-textboxHandle2" />
      <div className="infoBook-textboxHandle infoBook-textboxHandle3" />
      <div className="infoBook-textboxHandle infoBook-textboxHandle4" />
      <div className="infoBook-textboxInner">Editable textbox preview…</div>
    </div>
    <div className="infoBook-stylePanelMock">Typography panel: Font • Size • Color • Bold • Italic • Strike</div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          Create a textbox, then <b>move</b>, <b>resize</b>, and <b>rotate</b> it freely.
        </li>
        <li>
          Set <b>font family</b>, <b>size</b>, <b>line spacing</b>, <b>alignment</b>, and colors.
        </li>
        <li>
          Use the selection tool to quickly switch between editing content and adjusting layout.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Textbox + handles + style panel preview</div>
  </div>
);

const Chapter4RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Lists</div>
    <div className="infoBook-listGrid">
      <div className="infoBook-listBox">• Bullet list\n• Bullet list\n• Bullet list</div>
      <div className="infoBook-listBox">1. Numbered\n2. Numbered\n3. Numbered</div>
      <div className="infoBook-listBox">☐ Checkbox\n☑ Checkbox\n☐ Checkbox</div>
      <div className="infoBook-listBox">Indent ⟶\nOutdent ⟵</div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        Lists are built for real documents—not just decoration.
      </p>
      <ul>
        <li>
          Choose <b>bullets</b>, <b>numbers</b>, or <b>checkboxes</b>.
        </li>
        <li>
          Use <code>Tab</code> / <code>Shift</code> + <code>Tab</code> to indent and outdent.
        </li>
        <li>
          Click checkboxes while editing to toggle them for task lists.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Clean separation boxes + friendly editing feel</div>
  </div>
);

// PAGES 13–14 — CHAPTER 5
const Chapter5LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 5 — Images & Shapes</div>
    <div className="infoBook-maskGrid">
      <div className="infoBook-maskCard">
        <div className="infoBook-maskShape infoBook-maskRound" />
        <div className="infoBook-caption">Round</div>
      </div>
      <div className="infoBook-maskCard">
        <div className="infoBook-maskShape infoBook-maskStar" />
        <div className="infoBook-caption">Star</div>
      </div>
      <div className="infoBook-maskCard">
        <div className="infoBook-maskShape infoBook-maskPoly" />
        <div className="infoBook-caption">Polygon</div>
      </div>
    </div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          Insert images and place them anywhere on a page.
        </li>
        <li>
          Use <b>masks</b> to crop into clean shapes (rounded cards, circles, badges, polygons).
        </li>
        <li>
          Add borders, adjust opacity, and fine-tune for a polished layout.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Masking examples with soft shadows</div>
  </div>
);

const Chapter5RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Infographic Wow</div>
    <div className="infoBook-flowchart">
      <div className="infoBook-flowNode">Start</div>
      <div className="infoBook-flowArrow">→</div>
      <div className="infoBook-flowNode">Process</div>
      <div className="infoBook-flowArrow">→</div>
      <div className="infoBook-flowNode">Done</div>
    </div>
    <div className="infoBook-swatches">
      <span className="infoBook-swatch" />
      <span className="infoBook-swatch infoBook-swatch2" />
      <span className="infoBook-swatch infoBook-swatch3" />
      <span className="infoBook-swatch infoBook-swatch4" />
    </div>
    <div className="infoBook-pageBody">
      <p>
        Shapes turn PDFs into explainers.
      </p>
      <ul>
        <li>
          Use rectangles, arrows, callouts, and flowchart blocks.
        </li>
        <li>
          Style with <b>fill</b>, <b>stroke</b>, <b>width</b>, and <b>opacity</b>.
        </li>
        <li>
          Arrange via layer controls to keep diagrams readable.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Flowchart + palette swatches</div>
  </div>
);

// PAGES 15–16 — CHAPTER 6
const Chapter6LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 6 — Annotations & Highlights</div>
    <div className="infoBook-highlightDemo">Highlighter over text preview</div>
    <div className="infoBook-sliderDemo">Opacity ▬▬▬●▬▬</div>
    <div className="infoBook-inkStrokes" aria-hidden="true">
      <div className="infoBook-inkStroke" />
      <div className="infoBook-inkStroke infoBook-inkStroke2" />
      <div className="infoBook-inkStroke infoBook-inkStroke3" />
    </div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          <b>Highlight</b> key sections while keeping text readable with opacity.
        </li>
        <li>
          <b>Ink</b> is perfect for quick reviews, marks, and notes.
        </li>
        <li>
          Adjust stroke width for subtle markup or bold annotations.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Highlight + opacity + stroke thickness</div>
  </div>
);

const Chapter6RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Signatures</div>
    <div className="infoBook-signatureBox">Signature example</div>
    <div className="infoBook-noteBox">Handwritten notes illustration</div>
    <div className="infoBook-pageBody">
      <p>
        For documents that need a personal touch:
      </p>
      <ul>
        <li>
          Sign directly with the ink tool.
        </li>
        <li>
          Combine text + shapes + ink to create clear review markup.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Swipe gesture icon for writing (scaffold)</div>
  </div>
);

// PAGES 17–18 — CHAPTER 7
const Chapter7LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 7 — Exporting & Saving</div>
    <div className="infoBook-exportMock">Export window mockup</div>
    <div className="infoBook-sampleRow">
      <div className="infoBook-sample">Page numbering samples</div>
      <div className="infoBook-sample">Watermark examples</div>
    </div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          Export creates a <b>new PDF</b> with your edits applied.
        </li>
        <li>
          Add <b>page numbers</b> to the whole document or selected ranges.
        </li>
        <li>
          Apply a <b>watermark</b> (draft/brand) with rotation and opacity.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Diagonal / faint / centered watermark styles</div>
  </div>
);

const Chapter7RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Checklist</div>
    <div className="infoBook-checklist">
      <label><input type="checkbox" readOnly checked /> Keep resolution</label>
      <label><input type="checkbox" readOnly checked /> Preserve page order</label>
      <label><input type="checkbox" readOnly checked /> Retain shapes</label>
      <label><input type="checkbox" readOnly checked /> Export settings</label>
    </div>
    <div className="infoBook-pageBody">
      <p>
        Exports are designed to be reliable: what you see on the canvas is what you get in the PDF.
      </p>
    </div>
    <div className="infoBook-stamp" aria-hidden="true">PDF READY</div>
  </div>
);

// PAGES 19–20 — CHAPTER 8
const Chapter8LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 8 — Google Drive Sync</div>
    <div className="infoBook-driveFolder">☁️  pdfstudio</div>
    <div className="infoBook-driveList">
      <div className="infoBook-driveRow">Report.pdf</div>
      <div className="infoBook-driveRow">Invoice.pdf</div>
      <div className="infoBook-driveRow">Notes.pdf</div>
    </div>
    <div className="infoBook-syncArrows" aria-hidden="true">⇄</div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          Browse recent PDFs in your Drive right inside the editor.
        </li>
        <li>
          Search and open a file with a single click.
        </li>
        <li>
          Save back to Drive when you want cross-device access.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Minimalist Drive dashboard feel</div>
  </div>
);

const Chapter8RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Your PDFs. Your Drive. Your Control.</div>
    <div className="infoBook-trustDiagram">
      <div className="infoBook-trustNode">Device</div>
      <div className="infoBook-trustArrow">→</div>
      <div className="infoBook-trustNode">Drive</div>
      <div className="infoBook-trustArrow">→</div>
      <div className="infoBook-trustNode">Other Device</div>
    </div>
    <div className="infoBook-trustLock" aria-hidden="true">
      <Icon name="lock" />
    </div>
    <div className="infoBook-pageBody">
      <p>
        Drive integration is optional and permission-aware.
      </p>
      <ul>
        <li>
          No Drive access is requested until you explicitly choose a Drive action.
        </li>
        <li>
          Your files remain in your Google Drive—you can still share/manage them normally.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Trustworthy + professional</div>
  </div>
);

// PAGES 21–22 — CHAPTER 9
const Chapter9LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 9 — Local-Only Privacy</div>
    <div className="infoBook-lockHero">
      <div className="infoBook-lockHalo" aria-hidden="true" />
      <div className="infoBook-lockIcon" aria-hidden="true">
        <Icon name="lock" />
      </div>
      <div className="infoBook-lockPdf" aria-hidden="true">PDF</div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        pdfstudio is local-first by design.
      </p>
      <ul>
        <li>
          Editing, rendering, and export happen in your browser.
        </li>
        <li>
          Nothing is uploaded automatically.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Soft halo glow to emphasize safety</div>
  </div>
);

const Chapter9RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Privacy Timeline</div>
    <div className="infoBook-timeline">
      <div className="infoBook-timelineItem">File stays on device</div>
      <div className="infoBook-timelineItem">All processing local</div>
      <div className="infoBook-timelineItem">Only Google login needed for Drive</div>
      <div className="infoBook-timelineItem">Zero server-side involvement</div>
    </div>
    <div className="infoBook-pageBody">
      <p>
        This model works well for sensitive documents—contracts, IDs, financial PDFs, and internal reports.
      </p>
    </div>
    <div className="infoBook-caption">Strong trust-building design</div>
  </div>
);

// PAGES 23–24 — CHAPTER 10
const Chapter10LeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Chapter 10 — Shortcuts & Efficiency</div>
    <div className="infoBook-keyboardGrid">
      {['Ctrl', 'Z', 'Shift', 'Y', 'C', 'V', 'Del', 'Esc', 'Tab', '↑', '↓', '←', '→'].map((k) => (
        <div key={k} className="infoBook-key">{k}</div>
      ))}
    </div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          <code>Ctrl</code> + <code>Z</code> undo, <code>Ctrl</code> + <code>Shift</code> + <code>Y</code> redo.
        </li>
        <li>
          <code>Del</code> removes selected objects.
        </li>
        <li>
          <code>Esc</code> exits editing/selection modes quickly.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Grid-style keyboard diagram (scaffold)</div>
  </div>
);

const Chapter10RightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Tips</div>
    <div className="infoBook-stickyRow">
      <div className="infoBook-sticky infoBook-stickyA">Rocket: group elements for speed</div>
      <div className="infoBook-sticky infoBook-stickyB">Lightning: reuse styles</div>
      <div className="infoBook-sticky infoBook-stickyC">Gears: keep layers tidy</div>
    </div>
    <div className="infoBook-pageBody">
      <ul>
        <li>
          Keep common layouts as a pattern: headings, callouts, and consistent margins.
        </li>
        <li>
          Use thumbnails and page tools to restructure before spending time on styling.
        </li>
        <li>
          When in doubt: export a draft early to validate print layout.
        </li>
      </ul>
    </div>
    <div className="infoBook-caption">Energetic, motivational</div>
  </div>
);

// PAGES 25–26 — CREDITS & APPRECIATION
const CreditsLeftPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-creditsBorder" aria-hidden="true" />
    <div className="infoBook-chapterHeader">Credits & Appreciation</div>
    <div className="infoBook-pageBody">
      <p>Thank you for using pdfstudio.</p>
      <p>This project is built with clarity, privacy, and love.</p>
      <ul>
        <li>
          Built as a fast, local-first PDF editor.
        </li>
        <li>
          Optional Google Drive sync for access anywhere.
        </li>
        <li>
          Designed to be simple on the surface, powerful underneath.
        </li>
      </ul>
    </div>
  </div>
);

const CreditsRightPage = () => (
  <div className="infoBook-pageContent">
    <div className="infoBook-chapterHeader">Thank you</div>
    <div className="infoBook-pageBody">
      <p>Developer acknowledgment and a short thank-you message.</p>
      <p>
        Final signed note: <b>“Built with clarity, privacy, and love.”</b>
      </p>
      <p>
        If pdfstudio helps you, share it with a friend or teammate—and keep your PDFs in your control.
      </p>
    </div>
    <div className="infoBook-qr" aria-hidden="true">QR</div>
    <div className="infoBook-caption">QR code placeholder (feedback form)</div>
  </div>
);

// OPTIONAL EPILOGUE (Right page only) — implemented as a final spread with blank left.
const EpilogueLeftBlank = () => <BlankCreamContent />;

const EpilogueRightPage = () => (
  <div className="infoBook-pageContent infoBook-verticalCenter">
    <div className="infoBook-epilogue">
      <p>Every document tells a story.</p>
      <p>Make yours beautiful.</p>
    </div>
  </div>
);

const LazyCover = lazyInline(CoverPage);
const LazySpacer = lazyInline(UnusedIndexSpacer);
const LazyPrefaceLeft = lazyInline(PrefaceLeftPage);
const LazyPrefaceRight = lazyInline(PrefaceRightPage);
const LazyTOCLeft = lazyInline(TableOfContentsLeftPage);
const LazyTOCRight = lazyInline(TableOfContentsRightPage);
const LazyCh1L = lazyInline(Chapter1LeftPage);
const LazyCh1R = lazyInline(Chapter1RightPage);
const LazyCh2L = lazyInline(Chapter2LeftPage);
const LazyCh2R = lazyInline(Chapter2RightPage);
const LazyCh3L = lazyInline(Chapter3LeftPage);
const LazyCh3R = lazyInline(Chapter3RightPage);
const LazyCh4L = lazyInline(Chapter4LeftPage);
const LazyCh4R = lazyInline(Chapter4RightPage);
const LazyCh5L = lazyInline(Chapter5LeftPage);
const LazyCh5R = lazyInline(Chapter5RightPage);
const LazyCh6L = lazyInline(Chapter6LeftPage);
const LazyCh6R = lazyInline(Chapter6RightPage);
const LazyCh7L = lazyInline(Chapter7LeftPage);
const LazyCh7R = lazyInline(Chapter7RightPage);
const LazyCh8L = lazyInline(Chapter8LeftPage);
const LazyCh8R = lazyInline(Chapter8RightPage);
const LazyCh9L = lazyInline(Chapter9LeftPage);
const LazyCh9R = lazyInline(Chapter9RightPage);
const LazyCh10L = lazyInline(Chapter10LeftPage);
const LazyCh10R = lazyInline(Chapter10RightPage);
const LazyCreditsL = lazyInline(CreditsLeftPage);
const LazyCreditsR = lazyInline(CreditsRightPage);
const LazyEpilogueL = lazyInline(EpilogueLeftBlank);
const LazyEpilogueR = lazyInline(EpilogueRightPage);

export const BOOK_PAGES: BookPageDef[] = [
  { id: 'cover', title: 'Cover', render: () => <LazyCover />, tocHidden: true },
  { id: 'spacer', title: 'Spacer', render: () => <LazySpacer />, tocHidden: true },
  { id: 'preface-left', title: 'Preface (Left)', render: () => <LazyPrefaceLeft />, tocHidden: true },
  { id: 'preface-right', title: 'Preface (Right)', render: () => <LazyPrefaceRight />, tocHidden: true },
  { id: 'toc-left', title: 'Table of Contents', render: () => <LazyTOCLeft />, tocHidden: true },
  { id: 'toc-right', title: 'Table of Contents (Icons)', render: () => <LazyTOCRight />, tocHidden: true },
  { id: 'ch1-left', title: 'Ch1 (Left)', render: () => <LazyCh1L /> },
  { id: 'ch1-right', title: 'Ch1 (Right)', render: () => <LazyCh1R /> },
  { id: 'ch2-left', title: 'Ch2 (Left)', render: () => <LazyCh2L /> },
  { id: 'ch2-right', title: 'Ch2 (Right)', render: () => <LazyCh2R /> },
  { id: 'ch3-left', title: 'Ch3 (Left)', render: () => <LazyCh3L /> },
  { id: 'ch3-right', title: 'Ch3 (Right)', render: () => <LazyCh3R /> },
  { id: 'ch4-left', title: 'Ch4 (Left)', render: () => <LazyCh4L /> },
  { id: 'ch4-right', title: 'Ch4 (Right)', render: () => <LazyCh4R /> },
  { id: 'ch5-left', title: 'Ch5 (Left)', render: () => <LazyCh5L /> },
  { id: 'ch5-right', title: 'Ch5 (Right)', render: () => <LazyCh5R /> },
  { id: 'ch6-left', title: 'Ch6 (Left)', render: () => <LazyCh6L /> },
  { id: 'ch6-right', title: 'Ch6 (Right)', render: () => <LazyCh6R /> },
  { id: 'ch7-left', title: 'Ch7 (Left)', render: () => <LazyCh7L /> },
  { id: 'ch7-right', title: 'Ch7 (Right)', render: () => <LazyCh7R /> },
  { id: 'ch8-left', title: 'Ch8 (Left)', render: () => <LazyCh8L /> },
  { id: 'ch8-right', title: 'Ch8 (Right)', render: () => <LazyCh8R /> },
  { id: 'ch9-left', title: 'Ch9 (Left)', render: () => <LazyCh9L /> },
  { id: 'ch9-right', title: 'Ch9 (Right)', render: () => <LazyCh9R /> },
  { id: 'ch10-left', title: 'Ch10 (Left)', render: () => <LazyCh10L /> },
  { id: 'ch10-right', title: 'Ch10 (Right)', render: () => <LazyCh10R /> },
  { id: 'credits-left', title: 'Credits (Left)', render: () => <LazyCreditsL /> },
  { id: 'credits-right', title: 'Credits (Right)', render: () => <LazyCreditsR /> },
  { id: 'epilogue-left', title: 'Epilogue (Left)', render: () => <LazyEpilogueL />, tocHidden: true },
  { id: 'epilogue-right', title: 'Epilogue (Right)', render: () => <LazyEpilogueR />, tocHidden: true },
];

export const BOOK_PAGE_COUNT = BOOK_PAGES.length;

export function isValidPageIndex(index: number) {
  return Number.isInteger(index) && index >= 0 && index < BOOK_PAGES.length;
}
