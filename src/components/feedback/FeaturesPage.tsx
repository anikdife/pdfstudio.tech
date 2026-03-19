// src/routes/FeaturesPage.tsx
// Route: /features
// Usage (React Router v6):
// <Route path="/features" element={<FeaturesPage />} />

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import TierComparisonModal from './TierComparisonModal';

type PlanKey = "free" | "premium" | "corp";

type Feature = {
  title: string;
  desc?: string;
  tags?: string[];
  availability: Record<PlanKey, boolean>;
};

type FeatureSection = {
  id: string;
  title: string;
  subtitle?: string;
  features: Feature[];
};

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.0 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
      />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 9V6a3 3 0 1 1 6 0v4H9Z"
      />
    </svg>
  );
}

function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2l1.1 3.6L16 7l-2.9 1.4L12 12l-1.1-3.6L8 7l2.9-1.4L12 2Zm7 9l.8 2.7L22 15l-2.2 1.3L19 19l-.8-2.7L16 15l2.2-1.3L19 11Zm-14 1l.8 2.7L8 16l-2.2 1.3L5 20l-.8-2.7L2 16l2.2-1.3L5 12Z"
      />
    </svg>
  );
}

function Dot({ className = "" }: { className?: string }) {
  return <span className={`dot ${className}`} />;
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "info";
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Availability({
  on,
  label,
}: {
  on: boolean;
  label: string;
}) {
  return (
    <span className={`avail ${on ? "avail-on" : "avail-off"}`} title={label}>
      {on ? (
        <CheckIcon className="ico" />
      ) : (
        <LockIcon className="ico" />
      )}
      <span className="avail-text">{label}</span>
    </span>
  );
}

function ScrollToTopButton({ targetId }: { targetId: string }) {
  return (
    <button
      className="ghostBtn"
      onClick={() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      type="button"
    >
      Back to top
    </button>
  );
}

export default function FeaturesPage() {
  const nav = useNavigate();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const upgradeEmail = useMemo(() => {
    const fromEnv = (((import.meta as any).env?.VITE_UPGRADE_EMAIL as string | undefined) ?? '').trim();
    return fromEnv || 'sales@pdfstudio.tech';
  }, []);

  const openUpgradeEmail = useCallback(
    (subject: string, body?: string) => {
      const mailto = `mailto:${encodeURIComponent(upgradeEmail)}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
      window.location.href = mailto;
    },
    [upgradeEmail]
  );

  const sections: FeatureSection[] = useMemo(() => {
    const all: Record<PlanKey, boolean> = { free: true, premium: true, corp: true };
    const premiumOnly: Record<PlanKey, boolean> = { free: false, premium: true, corp: true };
    const corpOnly: Record<PlanKey, boolean> = { free: false, premium: false, corp: true };

    return [
      {
        id: "pages",
        title: "Pages (Top Tab)",
        subtitle:
          "Page sizing, operations, restructuring, insert/export — everything that shapes the document.",
        features: [
          {
            title: "Page size controls",
            desc:
              "Preset + custom sizes, units (mm/in/pt), portrait/landscape, set as default, apply-to selection.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Page operations",
            desc:
              "Delete (multi-page), reorder (drag + OK applies), rotate ⟲/⟳, crop mode (apply/reset).",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "PDF restructuring & export helpers",
            desc:
              "Merge, Merge+ (multi-file flow), split (ranges modal), extract selected pages, extract image, Extract+ (page spec + combined/zip).",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Insert",
            desc: "Insert blank page, insert image page.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Export stamps settings",
            desc: "Page numbers + watermark settings for export.",
            availability: premiumOnly,
            tags: ["PropertiesPanel.tsx", "stamping.ts"],
          },
        ],
      },
      {
        id: "image",
        title: "Image (Top Tab)",
        subtitle: "Add images, masks, transforms, filters, appearance controls.",
        features: [
          {
            title: "Add image + image list",
            desc: "Select per page, copy, delete; jump to page and manage assets.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Shape masks",
            desc:
              "Rect/rounded/circle/ellipse/triangle/diamond/hexagon/polygon/star/bubble/heart.",
            availability: all,
            tags: ["ImageMaskPicker.tsx"],
          },
          {
            title: "Transforms",
            desc: "Flip H/V, skew X/Y + reset.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Filters",
            desc:
              "Brightness, contrast, saturation, grayscale, sepia, invert (+ resets).",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Appearance",
            desc: "Opacity, border radius, crop L/T/R/B with reset.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
        ],
      },
      {
        id: "ink",
        title: "Ink (Top Tab)",
        subtitle: "Freehand drawing tools built for markup and handwriting.",
        features: [
          {
            title: "Brush settings",
            desc: "Color, opacity, width.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Ink items list",
            desc: "Jump to page, copy, delete.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
        ],
      },
      {
        id: "highlight",
        title: "Highlight (Top Tab)",
        subtitle: "Mark important parts fast with clean highlighter strokes.",
        features: [
          {
            title: "Highlight settings",
            desc: "Color, opacity.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Highlight items list",
            desc: "Jump to page, copy, delete.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
        ],
      },
      {
        id: "text",
        title: "Text (Top Tab)",
        subtitle: "Professional text boxes with a real styling toolbar.",
        features: [
          {
            title: "Text tool defaults",
            desc: "Default color + font size slider.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "Text styling toolbar",
            desc:
              "Font family/size, text color, background, border style/width/color/off, bold/italic/strike, align L/C/R, line height.",
            availability: all,
            tags: ["TextToolbar.tsx"],
          },
          {
            title: "Text boxes list",
            desc: "Preview + page number; select (sets active page), copy, delete.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
        ],
      },
      {
        id: "list",
        title: "List (Top Tab)",
        subtitle: "Bullets, ordered lists, and checkbox lists with rich typography.",
        features: [
          {
            title: "List tool defaults",
            desc: "Color + opacity.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
          {
            title: "List styling toolbar",
            desc:
              "Marker types (ordered + checkbox), start number, indent/outdent all, indent size, font family/size, color, bold/italic/strike, align L/C/R, line height.",
            availability: all,
            tags: ["ListToolbar.tsx"],
          },
          {
            title: "Lists list",
            desc: "Preview + page number; select, copy, delete.",
            availability: all,
            tags: ["PropertiesPanel.tsx"],
          },
        ],
      },
      {
        id: "shape",
        title: "Shape (Top Tab)",
        subtitle: "A full shape library with layering controls.",
        features: [
          {
            title: "Shape library",
            desc:
              "Grouped gallery; includes speech bubble tail variants (some marked “later” disabled).",
            availability: all,
            tags: ["ShapePanel.tsx"],
          },
          {
            title: "Selected shape properties",
            desc:
              "Fill (or none), stroke color/width, opacity, layer ordering (back/forward/front).",
            availability: all,
            tags: ["ShapePanel.tsx"],
          },
          {
            title: "Added shapes list",
            desc: "On current page: select, copy, delete.",
            availability: all,
            tags: ["ShapePanel.tsx"],
          },
        ],
      },
      {
        id: "drive",
        title: "Google Drive (Cloud Files)",
        subtitle:
          "Least-privilege Drive integration with a dedicated dashboard and per-file controls.",
        features: [
          {
            title: "Sign-in via Google Identity Services",
            desc:
              "Least-privilege scope (drive.file) + profile/email; restores cached tokens on load.",
            availability: premiumOnly,
          },
          {
            title: "Dedicated Drive dashboard modal",
            desc:
              "Shows user name/email/avatar; open/close + Escape/backdrop-close.",
            availability: premiumOnly,
          },
          {
            title: "App folder management (pdfstudio-tech)",
            desc:
              "Auto-creates/uses folder; persists folderId per Firebase user; recovery if missing/inaccessible.",
            availability: premiumOnly,
          },
          {
            title: "List PDFs + search + metadata",
            desc:
              "Sorted by modified time; shows name/modified date/size; filename search box.",
            availability: premiumOnly,
          },
          {
            title: "Per-file actions",
            desc:
              "Open (download w/ progress + unsaved warning), Replace (upload current doc over), Delete.",
            availability: premiumOnly,
          },
          {
            title: "Corporate governance extras",
            desc:
              "Central admin policy controls + audit trails for Drive actions (recommended for regulated teams).",
            availability: corpOnly,
          },
        ],
      },
      {
        id: "launcher",
        title: "Launcher (OrbitLauncher)",
        subtitle:
          "Multi-entry launcher + wide import support via workers and the Drive dashboard shortcut.",
        features: [
          {
            title: "Launcher entry points",
            desc: "PDF, IMAGE, DATA, DOCS, DRIVE, MERGE, MD/TXT, NEW (+ Premium shortcut to /pw).",
            availability: all,
          },
          {
            title: "Supported open/import types",
            desc:
              "PDF (.pdf), IMAGE (jpg/png/webp/avif), DOCS (.docx/.odt; legacy .doc prompts conversion), DATA (.xlsx/.xls/.csv/.ods + .epub), MD/TXT (.md/.txt).",
            availability: all,
          },
          {
            title: "Drive shortcut inside launcher",
            desc: "Opens Drive dashboard directly from the launcher.",
            availability: premiumOnly,
          },
        ],
      },
    ];
  }, []);

  const premiumIndividualFeatures = useMemo(
    () => [
      { feature: 'AES-256 Encryption', free: '2 files / day', premium: '20 files / day' },
      { feature: 'PDF Form Builder', free: 'View & Fill only', premium: 'Full Custom Creation (Text, Checkbox, Radio)' },
      { feature: 'Typography', free: 'Standard System Fonts', premium: 'Custom Favorite Font Integration (.ttf/.otf)' },
      { feature: 'Privacy: Redaction', free: 'Manual overlay only', premium: 'Structural Permanent Redaction' },
      { feature: 'Privacy: Metadata', free: 'View Metadata', premium: 'Metadata Stripping (Author, Date, Location)' },
      { feature: 'OCR', free: 'N/A', premium: 'Optical Character Recognition (Image to Text)' },
      { feature: 'Productivity', free: 'Single file processing', premium: 'Batch Conversion (Up to 10 files at once)' },
    ],
    [],
  );

  const corpPremiumFeatures = useMemo(
    () => [
      { feature: 'User Access', corp: 'Unlimited Team Seats (Admin Console)' },
      { feature: 'Daily Encryption', corp: 'Unlimited (Bulk Processing)' },
      { feature: 'Form Building', corp: 'Advanced Logic (Calculations & JS)' },
      { feature: 'Digital Security', corp: 'Cryptographic Digital Signatures (PKI)' },
      { feature: 'Automation', corp: 'Parallel API & Workflow Integration' },
      { feature: 'Branding', corp: 'Full White-Labeling (Your Logo & Domain)' },
      { feature: 'Compliance', corp: 'Certified Redaction & Audit Logs' },
      { feature: 'Cloud Integration', corp: 'Shared Team Drives & Azure/S3 Support' },
    ],
    [],
  );

  const scrollTo = useCallback((id: string, opts?: { setHash?: boolean }) => {
    const setHash = opts?.setHash ?? true;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (setHash) {
      const next = `#${encodeURIComponent(id)}`;
      if (window.location.hash !== next) {
        window.history.replaceState(null, "", next);
      }
    }
  }, []);

  useEffect(() => {
    const hashId = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
    if (!hashId) return;
    // Defer until layout/paint so scrollIntoView finds the section.
    window.setTimeout(() => scrollTo(hashId, { setHash: false }), 0);
  }, [scrollTo]);

  return (
    <div className="wrap">
      <div className="bgDecor" aria-hidden="true" />

      <header className="hero">
        <div className="heroInner">
          <div className="heroLeft">
            <div className="badgeRow">
              <button type="button" className="pill pill-neutral pillLink" onClick={() => nav('/')}>Home</button>
              <button type="button" className="pill pill-neutral pillLink" onClick={() => nav('/editor')}>Editor</button>
              <button type="button" className="pill pill-warn pillLink" onClick={() => nav('/pw')}>Premium</button>
            </div>

            <TierComparisonModal variant="inline" isOpen={true} onClose={() => {}} />
          </div>

          <div className="heroRight">
            <div className="miniNav">
              <div className="miniNavTitle">Jump to</div>
              <div className="miniNavGrid">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    className="miniNavBtn"
                    href={`#${encodeURIComponent(s.id)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollTo(s.id);
                    }}
                  >
                    <Dot />
                    <span>{s.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="stage">
        <aside className="rail rail-left">
          <div className="railCard railCard-premium">
            <div className="railTop">
              <div className="railTitle">Premium Individual</div>
              <div className="railPrice">A$10.00<span>/mo</span></div>
              <div className="railTag">All the free features + cloud sync & pro export extras</div>
            </div>

            <div className="railBody">
              <div className="railTable" role="table" aria-label="Premium Individual Feature Set">
                <div className="railTh" role="columnheader">Feature</div>
                <div className="railTh" role="columnheader">Premium Individual</div>

                {premiumIndividualFeatures.map((r) => (
                  <React.Fragment key={r.feature}>
                    <div className="railTd railTdFeature" role="cell">{r.feature}</div>
                    <div className="railTd railTdPremium" role="cell">{r.premium}</div>
                  </React.Fragment>
                ))}
              </div>

              <button
                className="railBtn"
                type="button"
                onClick={() => openUpgradeEmail('Studio Pro Inquiry')}
              >
                Upgrade to Premium
              </button>
            </div>
          </div>

          <div className="railCard railCard-note">
            <div className="railTitleSmall">Why this is premium</div>
            <div className="railNote">
              Premium unlocks higher limits and advanced capabilities (encryption, form building, typography, privacy tools,
              OCR, and batch workflows) designed for power users.
            </div>
          </div>
        </aside>

        <section className="lane">
          <div className="laneChrome">
            <div className="laneTitleRow">
              <div>
                <div className="laneTitle">Use all the amazing features for free</div>
              </div>

            </div>

            <div className="laneDivider" />
          </div>

          <div className="laneScroller" ref={scrollerRef} id="featuresTop">
            {sections.map((section) => (
              <div key={section.id} id={section.id} className="section">
                {section.id !== 'drive' ? (
                  <div className="sectionHead">
                    <div className="sectionTitle">{section.title}</div>
                    {section.subtitle ? <div className="sectionSubtitle">{section.subtitle}</div> : null}
                  </div>
                ) : null}

                {section.features.some((f) => f.availability.free) ? (
                  <ul className="freeList">
                    {section.features
                      .filter((f) => f.availability.free)
                      .map((f) => (
                        <li key={f.title} className="freeItem">
                          <div className="freeItemTitle">
                            <CheckIcon className="freeItemIco" />
                            <span>{f.title}</span>
                          </div>
                          {f.desc ? <div className="freeItemDesc">{f.desc}</div> : null}
                        </li>
                      ))}
                  </ul>
                ) : section.id === 'drive' ? (
                  <div className="driveInfo">
                    <div className="driveInfoTitle">Google Drive (Cloud Files)</div>
                    <div className="driveInfoText">
                      Connect your Google account to manage PDFs in the app folder <code>pdfstudio-tech</code>.
                    </div>
                    <ul className="driveInfoList">
                      <li>Sign in with Google (least-privilege <code>drive.file</code> scope).</li>
                      <li>See your Drive PDFs with name, modified time, and size + quick search.</li>
                      <li>Open a PDF into the editor (with download progress + unsaved-changes warning).</li>
                      <li>Upload the current editor document as a new Drive PDF.</li>
                      <li>Replace an existing Drive file with your current document.</li>
                      <li>Delete Drive files from within the dashboard.</li>
                      <li>Auto-recovers if the folder was deleted or access changed.</li>
                    </ul>
                  </div>
                ) : (
                  <div className="freeEmpty">No features available in this section.</div>
                )}
              </div>
            ))}

            <div className="laneFooter">
              <div className="laneFooterCard">
                <div className="laneFooterTitle">Free plan (baseline)</div>
                <div className="laneFooterText">
                  All core editing & document construction tools: Pages, Images, Ink, Highlight, Text, Lists, Shapes,
                  and full Launcher import types. Premium adds Drive Cloud Files and export stamping.
                </div>
              </div>

              <div className="laneFooterActions">
                <ScrollToTopButton targetId="featuresTop" />
              </div>
            </div>
          </div>
        </section>

        <aside className="rail rail-right">
          <div className="railCard railCard-corp">
            <div className="bestValue">BEST VALUE</div>

            <div className="railTop">
              <div className="railTitle">Premium Corporate</div>
              <div className="railPrice">
                A$9.99<span>/user/mo</span>
              </div>
              <div className="railTag">Min 5 users • teams & businesses</div>
            </div>

            <div className="railBody">
              <div className="railTable" role="table" aria-label="Corporate Premium tier comparison">
                <div className="railTh" role="columnheader">Feature</div>
                <div className="railTh" role="columnheader">Corporate Premium</div>

                {corpPremiumFeatures.map((r) => (
                  <React.Fragment key={r.feature}>
                    <div className="railTd railTdFeature" role="cell">{r.feature}</div>
                    <div className="railTd railTdCorp" role="cell">{r.corp}</div>
                  </React.Fragment>
                ))}
              </div>

              <button
                className="railBtn railBtnCorp"
                type="button"
                onClick={() => openUpgradeEmail('Corporate Studio Inquiry')}
              >
                Contact / Upgrade
              </button>
            </div>
          </div>

          <div className="railCard railCard-note">
            <div className="railTitleSmall">Corporate note</div>
            <div className="railNote">
              Corporate pricing undercuts many market leaders. Keep corporate features focused on governance + audit +
              standardization (low compute cost, high perceived value).
            </div>
          </div>
        </aside>
      </main>

      <style>{css}</style>
    </div>
  );
}

const css = `
:root {
  --bg: #0b1220;
  --panel: rgba(255,255,255,0.06);
  --panel2: rgba(255,255,255,0.08);
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.68);
  --muted2: rgba(255,255,255,0.55);
  --border: rgba(255,255,255,0.10);
  --border2: rgba(255,255,255,0.14);
  --shadow: 0 24px 80px rgba(0,0,0,0.55);
  --shadow2: 0 10px 30px rgba(0,0,0,0.40);
  --r: 22px;

  --free: rgba(180, 190, 205, 0.16);
  --prem: rgba(88, 166, 255, 0.18);
  --corp: rgba(255, 171, 64, 0.18);

  --premSolid: rgba(88, 166, 255, 0.92);
  --corpSolid: rgba(255, 171, 64, 0.92);
  --ok: rgba(70, 255, 150, 0.92);
}

* { box-sizing: border-box; }
.wrap {
  min-height: 100vh;
  background: radial-gradient(1100px 650px at 20% 10%, rgba(88,166,255,0.16), transparent 60%),
              radial-gradient(900px 520px at 85% 30%, rgba(255,171,64,0.14), transparent 55%),
              radial-gradient(1100px 720px at 50% 100%, rgba(140,120,255,0.12), transparent 60%),
              var(--bg);
  color: var(--text);
  position: relative;
  overflow: hidden;
}

.bgDecor {
  position: absolute;
  inset: -40px;
  background:
    linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 40%),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 72px);
  opacity: 0.35;
  pointer-events: none;
  mask-image: radial-gradient(circle at 35% 0%, black 0%, transparent 70%);
}

.hero {
  padding: 36px 18px 16px;
  max-width: 1300px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

.heroInner {
  display: grid;
  gap: 16px;
  grid-template-columns: 1.6fr 1fr;
  align-items: start;
}

@media (max-width: 1050px) {
  .heroInner { grid-template-columns: 1fr; }
}

.badgeRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
  font-size: 12px;
}

.pill-info { background: rgba(88,166,255,0.12); border-color: rgba(88,166,255,0.22); color: rgba(210,235,255,0.92); }
.pill-good { background: rgba(70,255,150,0.10); border-color: rgba(70,255,150,0.20); color: rgba(210,255,235,0.92); }
.pill-warn { background: rgba(255,171,64,0.10); border-color: rgba(255,171,64,0.22); color: rgba(255,231,200,0.92); }

.pillLink{
  cursor: pointer;
  user-select: none;
}

.pillLink:hover{
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.22);
}

.pillLink:focus-visible{
  outline: 2px solid rgba(88,166,255,0.80);
  outline-offset: 3px;
}

.miniIco { width: 16px; height: 16px; opacity: 0.95; }

.h1 {
  font-size: 34px;
  line-height: 1.12;
  letter-spacing: -0.02em;
  margin: 0 0 10px;
}

@media (max-width: 520px) {
  .h1 { font-size: 28px; }
}

.sub {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  max-width: 70ch;
}

.tierHero {
  margin: 0 0 18px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: rgba(255,255,255,0.04);
  box-shadow: var(--shadow2);
}

.tierHeroTitle {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: rgba(255,255,255,0.95);
}

.tierHeroSub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.tierHeroActions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.ctaRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.primaryBtn, .ghostBtn {
  border-radius: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border2);
  cursor: pointer;
  font-weight: 700;
  transition: transform 120ms ease, background 160ms ease, border-color 160ms ease;
  user-select: none;
}

.primaryBtn {
  background: linear-gradient(135deg, rgba(88,166,255,0.95), rgba(140,120,255,0.90));
  color: rgba(10, 14, 22, 0.98);
  box-shadow: var(--shadow2);
}

.primaryBtn:hover { transform: translateY(-1px); }
.primaryBtn:active { transform: translateY(0px); }

.ghostBtn {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.88);
}

.ghostBtn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.20);
}

.heroRight {
  display: flex;
  justify-content: flex-end;
}

.miniNav {
  width: 100%;
  max-width: 520px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.18);
  backdrop-filter: blur(10px);
  border-radius: var(--r);
  padding: 14px;
  box-shadow: var(--shadow2);
}

.miniNavTitle {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
  color: rgba(255,255,255,0.86);
}

.miniNavGrid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 520px) {
  .miniNavGrid { grid-template-columns: 1fr; }
}

.miniNavBtn {
  width: 100%;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.86);
  text-decoration: none;
  border-radius: 14px;
  padding: 10px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 160ms ease, transform 120ms ease, border-color 160ms ease;
  text-align: left;
}

.miniNavBtn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.18);
  transform: translateY(-1px);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(88,166,255,0.95), rgba(255,171,64,0.90));
  box-shadow: 0 0 0 4px rgba(88,166,255,0.12);
  flex: 0 0 auto;
}

.miniNavHint {
  margin-top: 10px;
  color: var(--muted2);
  font-size: 12px;
  line-height: 1.5;
}

.stage {
  max-width: 1300px;
  margin: 0 auto;
  padding: 14px 18px 28px;
  display: grid;
  gap: 14px;
  grid-template-columns: 340px minmax(0, 1fr) 340px;
  align-items: start;
  position: relative;
  z-index: 1;
}

@media (max-width: 1180px) {
  .stage { grid-template-columns: 300px minmax(0, 1fr) 300px; }
}
@media (max-width: 1000px) {
  .stage { grid-template-columns: 1fr; }
  .rail { position: static !important; top: auto !important; }
}

.rail {
  position: sticky;
  top: 14px;
  display: grid;
  gap: 12px;
}

.railCard {
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.18);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow2);
  overflow: hidden;
}

.railCard-premium .railTop {
  background: radial-gradient(600px 240px at 30% 0%, rgba(88,166,255,0.32), transparent 55%),
              rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.railCard-corp .railTop {
  background: radial-gradient(600px 240px at 60% 0%, rgba(255,171,64,0.28), transparent 55%),
              rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.railTop {
  padding: 14px 14px 12px;
}

.railTitle {
  font-weight: 900;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.railPrice {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 950;
  letter-spacing: -0.03em;
}

.railPrice span {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
  margin-left: 6px;
}

.railTag {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
}

.railBody {
  padding: 14px;
}

.railTableTitle {
  font-weight: 950;
  font-size: 14px;
  color: rgba(255,255,255,0.92);
  margin-bottom: 10px;
}

.railTable {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  overflow: hidden;
}

.railTh {
  padding: 10px 12px;
  font-weight: 900;
  font-size: 12px;
  color: rgba(255,255,255,0.86);
  background: rgba(0,0,0,0.18);
  border-bottom: 1px solid rgba(255,255,255,0.10);
}

.railTd {
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.35;
  color: rgba(255,255,255,0.80);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.railTdFeature {
  font-weight: 900;
  color: rgba(255,255,255,0.88);
}

.railTdPremium {
  font-weight: 900;
  color: rgba(190, 220, 255, 0.96);

    .railTdCorp{
      color: rgba(255,255,255,0.92);
    }
}

.railTable > :nth-last-child(-n+2) {
  border-bottom: none;
}

.hl {
  padding: 10px 10px;
  border-radius: 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 10px;
}

.hlTop {
  display: flex;
  gap: 10px;
  align-items: center;
}

.hlIco {
  width: 18px;
  height: 18px;
  color: rgba(70,255,150,0.92);
  flex: 0 0 auto;
}

.hlText {
  font-weight: 900;
  font-size: 13px;
  color: rgba(255,255,255,0.88);
}

.hlSub {
  margin-left: 28px;
  margin-top: 4px;
  color: var(--muted2);
  font-size: 12px;
  line-height: 1.45;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin: 12px 0;
}

.railListTitle {
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.86);
  margin-bottom: 10px;
  text-transform: uppercase;
}

.railList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.railList li {
  display: flex;
  gap: 10px;
  color: rgba(255,255,255,0.84);
  font-size: 13px;
  line-height: 1.35;
}

.liIco { width: 18px; height: 18px; color: rgba(70,255,150,0.92); flex: 0 0 auto; margin-top: 1px; }

.railBtn {
  margin-top: 14px;
  width: 100%;
  border-radius: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(135deg, rgba(88,166,255,0.92), rgba(140,120,255,0.88));
  color: rgba(10, 14, 22, 0.98);
  font-weight: 950;
  cursor: pointer;
  box-shadow: var(--shadow2);
  transition: transform 120ms ease;
}

.railBtn:hover { transform: translateY(-1px); }
.railBtn:active { transform: translateY(0px); }

.railBtnCorp {
  background: linear-gradient(135deg, rgba(255,171,64,0.92), rgba(255,115,64,0.86));
}

.railCard-note {
  padding: 12px 14px;
}

.railTitleSmall {
  font-weight: 900;
  font-size: 12px;
  color: rgba(255,255,255,0.86);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.railNote {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.railNote code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.86);
}

.bestValue {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,171,64,0.28);
  background: rgba(255,171,64,0.14);
  color: rgba(255,231,200,0.95);
  font-weight: 950;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lane {
  position: relative;
  border-radius: 32px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  box-shadow: var(--shadow);
  overflow: hidden;
}

/* Curved inward edges (your sketch): we "cut out" big circles with page background. */
.lane::before, .lane::after {
  content: "";
  position: absolute;
  top: 120px;
  bottom: 30px;
  width: 320px;
  border-radius: 999px;
  background: var(--bg);
  filter: drop-shadow(0 0 0 rgba(0,0,0,0));
  z-index: 2;
  pointer-events: none;
  opacity: 0.98;
}
.lane::before { left: -210px; }
.lane::after { right: -210px; }

@media (max-width: 1000px) {
  .lane::before, .lane::after { display: none; }
}

.laneChrome {
  padding: 14px 16px 10px;
  position: sticky;
  top: 0;
  z-index: 5;
  background:
    linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.06)),
    rgba(255,255,255,0.02);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.laneTitleRow {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
}

.laneTitle {
  font-weight: 950;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.laneSub {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.legend {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-left: auto;
}

.legendItem {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
}

.laneDivider {
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin-top: 10px;
}

.laneScroller {
  height: calc(100vh - 260px);
  overflow: auto;
  padding: 16px;
  position: relative;
  z-index: 3; /* above the cutout circles */
  scroll-behavior: smooth;
}

@media (max-width: 1000px) {
  .laneScroller { height: auto; max-height: none; }
}

.section {
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.sectionHead {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.sectionTitle {
  font-weight: 950;
  font-size: 16px;
}

.sectionSubtitle {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.sectionChips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.freeList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
  max-width: 820px;
  margin-left: auto;
  margin-right: auto;
}

.freeItem {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: var(--shadow2);
}

.freeItemTitle {
  display: flex;
  gap: 10px;
  align-items: center;
  font-weight: 900;
  color: rgba(255,255,255,0.92);
}

.freeItemIco { width: 18px; height: 18px; color: rgba(70,255,150,0.92); flex: 0 0 auto; }

.freeItemDesc {
  margin-left: 28px;
  margin-top: 4px;
  color: var(--muted2);
  font-size: 13px;
  line-height: 1.45;
}

.freeEmpty {
  max-width: 820px;
  margin: 0 auto;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px dashed rgba(255,255,255,0.16);
  color: var(--muted2);
}

.driveInfo {
  max-width: 820px;
  margin: 0 auto;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 18px;
  padding: 14px;
  box-shadow: var(--shadow2);
}

.driveInfoTitle {
  font-weight: 950;
  color: rgba(255,255,255,0.92);
  margin-bottom: 6px;
}

.driveInfoText {
  color: var(--muted2);
  font-size: 13px;
  line-height: 1.45;
  margin-bottom: 10px;
}

.driveInfoList {
  margin: 0;
  padding-left: 18px;
  color: rgba(255,255,255,0.84);
  font-size: 13px;
  line-height: 1.5;
}

.featureGrid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 720px) {
  .featureGrid { grid-template-columns: 1fr; }
}

.featCard {
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  padding: 12px 12px;
  transition: transform 120ms ease, border-color 160ms ease, background 160ms ease;
}

.featCard:hover {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
}

.featTop {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
}

.featTitle {
  font-weight: 920;
  font-size: 13px;
  color: rgba(255,255,255,0.88);
}

.featBadges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.featDesc {
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.featTags {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  font-size: 11px;
  color: rgba(255,255,255,0.78);
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.16);
}

.avail {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.82);
  font-size: 11px;
  line-height: 1;
}

.avail .ico { width: 14px; height: 14px; }
.avail-on { border-color: rgba(70,255,150,0.20); background: rgba(70,255,150,0.08); }
.avail-on .ico { color: rgba(70,255,150,0.92); }

.avail-off { border-color: rgba(255,255,255,0.10); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.60); }
.avail-off .ico { color: rgba(255,255,255,0.55); }

.avail-text { display: none; }
@media (min-width: 560px) {
  .avail-text { display: inline; }
}

.laneFooter {
  margin-top: 18px;
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr auto;
  align-items: center;
}

@media (max-width: 720px) {
  .laneFooter { grid-template-columns: 1fr; }
}

.laneFooterCard {
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.14);
  padding: 12px 12px;
}

.laneFooterTitle {
  font-weight: 950;
  font-size: 13px;
}

.laneFooterText {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.laneFooterActions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
`;
