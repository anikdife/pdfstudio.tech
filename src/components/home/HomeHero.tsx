import type { FC } from 'react';
import { Logo } from '../../app/logo';
import { HomeCommandStrip } from '../../app/HomeCommandStrip';
import { HomeFeatureImages } from '../../app/HomeFeatureImages';
import { HomeSummaryTyper } from '../../app/HomeSummaryTyper';

export type HomeHeroProps = {
  variant: 'desktop' | 'mobile';
  onGoogleLogin: () => void;
  onInfo: () => void;
  onOpenFile: () => void;
  onNewDoc: () => void;
  onTryIt: () => void;
};

export const HomeHero: FC<HomeHeroProps> = (props) => {
  if (props.variant === 'desktop') {
    return (
      <>
        <div className="homeCenterLogo" aria-hidden="true">
          <Logo showWordmark={true} />
        </div>

        <HomeFeatureImages />

        <HomeSummaryTyper />

        <HomeCommandStrip
          onGoogleLogin={props.onGoogleLogin}
          onInfo={props.onInfo}
          onOpenFile={props.onOpenFile}
          onNewDoc={props.onNewDoc}
          onTryIt={props.onTryIt}
        />
      </>
    );
  }

  return (
    <section className="homeMobileHero" aria-label="Home hero">
      <div className="homeMobileHeroLogo" aria-hidden="true">
        <Logo showWordmark={true} />
      </div>

      <h1 className="homeMobileHeroHeadline">Edit PDFs locally. Access them anywhere.</h1>
      <p className="homeMobileHeroSubline">Privacy-first editing with optional Google Drive workspace.</p>

      <div className="homeMobileHeroDock" aria-hidden="true" />

      <div className="homeMobileHeroActions" aria-label="Primary actions">
        <button type="button" className="homeMobileHeroBtn" onClick={props.onNewDoc}>
          New
        </button>
        <button type="button" className="homeMobileHeroBtn" onClick={props.onOpenFile}>
          Open
        </button>
        <button type="button" className="homeMobileHeroBtn" onClick={props.onGoogleLogin}>
          Google Drive
        </button>
        <button type="button" className="homeMobileHeroBtn" onClick={props.onInfo}>
          Info
        </button>
      </div>
    </section>
  );
};
