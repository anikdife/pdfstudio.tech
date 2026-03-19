export function HomeFlow() {
  return (
    <div className="homeFlowScene" aria-hidden="true">
      <div className="homeFlowCard">
        <div className="homeFlowIcon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h3>Privacy</h3>
        <p>On-device processing ensures your data stays in your hands.</p>
      </div>

      <div className="homeFlowCard">
        <div className="homeFlowIcon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </div>
        <h3>Cloud Sync</h3>
        <p>Seamless Google Drive CRUD for files anywhere, anytime.</p>
      </div>

      <div className="homeFlowCard">
        <div className="homeFlowIcon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <h3>Localization</h3>
        <p>Full Unicode support with professional Nikosh rendering.</p>
      </div>

      <div className="homeFlowCard">
        <div className="homeFlowIcon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        </div>
        <h3>Layout</h3>
        <p>Precise object-level editing and professional border presets.</p>
      </div>

      <div className="homeFlowCard">
        <div className="homeFlowIcon">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h3>Performance</h3>
        <p>Hardware-accelerated speed for high-volume document tasks.</p>
      </div>
    </div>
  );
}
