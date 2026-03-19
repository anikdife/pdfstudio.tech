import { useEffect } from 'react';
import { Routes } from './routes';
import { useFirebaseUserStore } from '../state/firebaseUserStore';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { setFaviconFromSvgReactElement } from './util/favicon';
import { Logo } from './logo';

export function App() {
  const initFirebaseAuth = useFirebaseUserStore((s) => s.initFirebaseAuth);

  useDocumentTitle();

  // Set favicon dynamically from the Logo SVG.
  useEffect(() => {
    setFaviconFromSvgReactElement(
      <Logo
        showWordmark={false}
        // Tight crop around the icon paths so it renders larger at 16x16.
        viewBox="130 70 270 280"
        width={256}
        height={256}
        aria-hidden="true"
        focusable="false"
      />,
    );
  }, []);

  return <Routes />;
}
