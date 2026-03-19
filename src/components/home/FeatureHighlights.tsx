import type { FC } from 'react';
import { HomeFlow } from '../../app/HomeFlow';

export type FeatureHighlightsProps = {
  variant: 'desktop' | 'mobile';
};

const FEATURE_CARDS = [
  {
    title: 'Privacy',
    body: 'On-device processing ensures your data stays in your hands.',
  },
  {
    title: 'Cloud Sync',
    body: 'Seamless Google Drive CRUD for files anywhere, anytime.',
  },
  {
    title: 'Localization',
    body: 'Full Unicode support with professional Nikosh rendering.',
  },
  {
    title: 'Layout',
    body: 'Precise object-level editing and professional border presets.',
  },
  {
    title: 'Performance',
    body: 'Hardware-accelerated speed for high-volume document tasks.',
  },
] as const;

export const FeatureHighlights: FC<FeatureHighlightsProps> = (props) => {
  if (props.variant === 'desktop') {
    return (
      <>
        <HomeFlow />
      </>
    );
  }

  return (
    <section className="homeMobileSection" aria-label="Feature highlights">
      <h2 className="homeMobileSectionTitle">Highlights</h2>
      <div className="homeHighlightsCarousel" role="list" aria-label="Highlights carousel">
        {FEATURE_CARDS.map((c) => (
          <article key={c.title} className="homeHighlightsCard" role="listitem">
            <div className="homeHighlightsCardTitle">{c.title}</div>
            <div className="homeHighlightsCardBody">{c.body}</div>
          </article>
        ))}
      </div>
    </section>
  );
};
