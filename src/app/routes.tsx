import { Route, Routes as RouterRoutes, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { EditorLayout } from './layout/EditorLayout';
import { EditorPage } from '../editor/EditorPage';
import { MobileEditor } from '../editor/MobileEditor';
import PasswordSingleFile from '../premium/passwordSingleFile';
import FeaturesPage from '../components/feedback/FeaturesPage';
import FeedbackAdminPage from '../components/feedback/FeedbackAdminPage';
import { useDocumentStore } from '../editor/state/documentStore';
import { useGoogleStore } from '../state/googleStore';
import { InfoBook } from '../components/InfoBook/InfoBook';
import { FeedbackButton } from '../components/feedback/FeedbackButton';
import { FeedbackOverlay } from '../components/feedback/FeedbackOverlay';
import { FeatureHighlights, HomeFooter, HomeHero, HowItWorks } from '../components/home';
import { logFileOpened } from '../services/firebaseActivity';

const ResumePage = lazy(() => import('../pages/ResumePage'));

function Home() {
  const navigate = useNavigate();
  const loadPdfFromFile = useDocumentStore((s) => s.loadPdfFromFile);
  const newDoc = useDocumentStore((s) => s.newDoc);
  const signIn = useGoogleStore((s) => s.signIn);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  return (
    <main className="homeBg homePage">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError(null);
          try {
            await loadPdfFromFile(file);
            void logFileOpened(file.name, 'local');
            navigate('/editor', { state: { preserveDoc: true } });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load PDF');
          } finally {
            if (inputRef.current) inputRef.current.value = '';
          }
        }}
      />

      {/* Desktop: preserve existing hero composition */}
      <section className="home homeFlow homeDesktopStage" aria-label="Home">
        <FeatureHighlights variant="desktop" />
        <HomeHero
          variant="desktop"
          onGoogleLogin={() => {
            void (async () => {
              try {
                const ok = await signIn();
                if (ok) navigate('/editor');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Google sign-in failed');
              }
            })();
          }}
          onInfo={() => setInfoOpen(true)}
          onOpenFile={() => inputRef.current?.click()}
          onNewDoc={() => {
            void (async () => {
              setError(null);
              try {
                await newDoc();
                navigate('/editor', { state: { preserveDoc: true } });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create blank doc');
              }
            })();
          }}
          onTryIt={() => navigate('/editor')}
        />
        <HomeFooter variant="desktop" onOpenPricing={() => navigate('/features')} />
        {error ? <div className="error" style={{ zIndex: 2, maxWidth: 'min(720px, 100%)' }}>{error}</div> : null}
      </section>

      {/* Mobile-first: stacked layout */}
      <section className="homeMobileStack" aria-label="Home">
        <HomeHero
          variant="mobile"
          onGoogleLogin={() => {
            void (async () => {
              try {
                const ok = await signIn();
                if (ok) navigate('/editor');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Google sign-in failed');
              }
            })();
          }}
          onInfo={() => setInfoOpen(true)}
          onOpenFile={() => inputRef.current?.click()}
          onNewDoc={() => {
            void (async () => {
              setError(null);
              try {
                await newDoc();
                navigate('/editor', { state: { preserveDoc: true } });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create blank doc');
              }
            })();
          }}
          onTryIt={() => navigate('/editor')}
        />
        <FeatureHighlights variant="mobile" />
        <HowItWorks />
        <HomeFooter variant="mobile" onOpenPricing={() => navigate('/features')} />
        {error ? <div className="error" style={{ zIndex: 2, maxWidth: 'min(720px, 100%)' }}>{error}</div> : null}
      </section>

      <InfoBook open={infoOpen} onClose={() => setInfoOpen(false)} />

      <FeedbackButton onOpen={() => setIsFeedbackOpen(true)} />
      <FeedbackOverlay isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </main>
  );
}

export function Routes() {
  function EditorRoute() {
    const [isMobile, setIsMobile] = useState(() => {
      if (typeof window === 'undefined') return false;
      // Avoid swapping to MobileEditor just because the window is narrow (e.g. desktop with DevTools docked).
      // Requiring a coarse pointer keeps desktop on the desktop editor.
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      const isNarrow = window.matchMedia('(max-width: 860px)').matches;
      return isCoarse && isNarrow;
    });

    useEffect(() => {
      const mqCoarse = window.matchMedia('(pointer: coarse)');
      const mqNarrow = window.matchMedia('(max-width: 860px)');
      const update = () => setIsMobile(mqCoarse.matches && mqNarrow.matches);
      update();
      mqCoarse.addEventListener('change', update);
      mqNarrow.addEventListener('change', update);
      return () => {
        mqCoarse.removeEventListener('change', update);
        mqNarrow.removeEventListener('change', update);
      };
    }, []);

    useEffect(() => {
      if (!import.meta.env.DEV) return;
      try {
        if (window.localStorage?.getItem('xpdf:debug:verbose') !== '1') return;
      } catch {
        return;
      }
      // eslint-disable-next-line no-console
      console.log('[xpdf:debug] editor-route:mode', isMobile ? 'mobile' : 'desktop');
    }, [isMobile]);

    if (isMobile) return <MobileEditor />;
    return (
      <EditorLayout>
        <EditorPage />
      </EditorLayout>
    );
  }

  return (
    <RouterRoutes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Home />} />
      <Route
        path="/home"
        element={<EditorRoute />}
      />
      <Route
        path="/editor"
        element={<EditorRoute />}
      />
      <Route path="/pw" element={<PasswordSingleFile />} />
      <Route
        path="/resume"
        element={(
          <Suspense fallback={<main className="homeBg homePage" />}> 
            <ResumePage />
          </Suspense>
        )}
      />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/feedback" element={<FeedbackAdminPage />} />
    </RouterRoutes>
  );
}
