import { ReactNode, useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { MobileBottomBar } from './MobileBottomBar';
import { useUiStore } from '../../editor/state/uiStore';
import { useGoogleStore } from '../../state/googleStore';
import { DriveDashboard } from '../../components/cloud/DriveDashboard';
import { FeedbackOverlay } from '../../components/feedback/FeedbackOverlay';
import { useFirebaseUserStore } from '../../state/firebaseUserStore';

export function EditorLayout({ children }: { children: ReactNode }) {
  const isMobile = useUiStore((s) => s.isMobile);
  const setIsMobile = useUiStore((s) => s.setIsMobile);
  const setOrbitLauncherOpen = useUiStore((s) => s.setOrbitLauncherOpen);
  const orbitLauncherOpen = useUiStore((s) => s.orbitLauncherOpen);

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const auth = useGoogleStore((s) => s.auth);
  const isDashboardOpen = useGoogleStore((s) => s.isDashboardOpen);
  const openDashboard = useGoogleStore((s) => s.openDashboard);
  const closeDashboard = useGoogleStore((s) => s.closeDashboard);
  const beginDriveConnectFromClick = useGoogleStore((s) => s.beginDriveConnectFromClick);
  const initAuth = useGoogleStore((s) => s.initAuth);
  const isFirebaseAuthReady = useFirebaseUserStore((s) => s.isAuthReady);
  const firebaseUid = useFirebaseUserStore((s) => s.firebaseUser?.uid ?? null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [setIsMobile]);

  useEffect(() => {
    // Preload GIS and restore any cached token WITHOUT prompting.
    // This ensures the click-driven popup isn't blocked by awaiting script load.
    if (!isFirebaseAuthReady) return;
    void initAuth();
  }, [initAuth, isFirebaseAuthReady, firebaseUid]);

  // No redirect handoff needed for Drive-click (we use Drive token -> Firebase credential).

  return (
    <div className="appShell studioShell">
      <div className="studioFrame">
        <TopBar />
        <div className="mainRow">
          <LeftPanel />
          <main className="mainArea">{children}</main>
          <RightPanel />
        </div>
        {isMobile ? <MobileBottomBar /> : null}
      </div>

      {!orbitLauncherOpen ? (
        <button
          type="button"
          className="orbitLauncherFab"
          title="Open launcher"
          aria-label="Open launcher"
          onClick={() => setOrbitLauncherOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.8a1 1 0 0 1 1 1V6h2.2a1 1 0 1 1 0 2H13v2.2a1 1 0 1 1-2 0V8H8.8a1 1 0 1 1 0-2H11V3.8a1 1 0 0 1 1-1z"
            />
            <path
              fill="currentColor"
              d="M12 14.5a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4z"
              opacity="0.85"
            />
            <path
              fill="currentColor"
              d="M4.8 12a1 1 0 0 1 1-1h1.6a1 1 0 1 1 0 2H5.8a1 1 0 0 1-1-1zm11.8 0a1 1 0 0 1 1-1h1.6a1 1 0 1 1 0 2h-1.6a1 1 0 0 1-1-1zM12 16.6a1 1 0 0 1 1 1v1.6a1 1 0 1 1-2 0v-1.6a1 1 0 0 1 1-1z"
              opacity="0.7"
            />
          </svg>
        </button>
      ) : null}

      {!orbitLauncherOpen ? (
        <button
          type="button"
          className="editorFeedbackFab"
          title="Give feedback"
          aria-label="Give feedback"
          onClick={() => setIsFeedbackOpen(true)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M7.5 16.5 4 20V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16h-10Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M7.5 8.5h9M7.5 11.5h6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}

      {!orbitLauncherOpen ? (
        <button
          type="button"
          className="cloudDashFab"
          title={auth?.isSignedIn ? 'Google Drive' : 'Sign in with Google'}
          aria-label={auth?.isSignedIn ? 'Cloud dashboard' : 'Sign in with Google'}
          onClick={() => {
          if (auth?.isSignedIn) {
              if (isDashboardOpen) closeDashboard();
              else openDashboard();
            return;
          }

          // Open the dashboard immediately so the user sees progress/errors.
          // We'll then attempt the click-driven interactive connect.
          openDashboard();

          // Click-safe: may trigger Firebase redirect immediately when logged out.
          beginDriveConnectFromClick();
          }}
        >
        {auth?.isSignedIn ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M10 4h8a2 2 0 0 1 2 2v2h-9.4a2 2 0 0 0-1.6.8l-1.2 1.6H4V6a2 2 0 0 1 2-2h4zm-2.5 7L9.8 8.8A1 1 0 0 1 10.6 8H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7h3.5z"
            />
          </svg>
        )}
        </button>
      ) : null}

      {isDashboardOpen ? <DriveDashboard /> : null}

      <FeedbackOverlay isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  );
}
