import type { FC } from 'react';

export const HowItWorks: FC = () => {
  return (
    <section className="homeHowItWorks" aria-label="How it works">
      <div className="homeHowItWorksInner">
        <h2 className="homeHowItWorksTitle">How it works</h2>
        <div className="homeHowItWorksGrid">
          <div className="homeHowItWorksCard">
            <div className="homeHowItWorksIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="homeHowItWorksCardTitle">Local-only mode</div>
            <div className="homeHowItWorksCardBody">Everything is processed on your device; we never see your files.</div>
          </div>

          <div className="homeHowItWorksCard">
            <div className="homeHowItWorksIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.7-1.7A4.5 4.5 0 1 1 18 18H7z" />
              </svg>
            </div>
            <div className="homeHowItWorksCardTitle">Drive workspace</div>
            <div className="homeHowItWorksCardBody">Optionally sync PDFs to a Drive folder and access them from anywhere.</div>
          </div>
        </div>
      </div>
    </section>
  );
};
