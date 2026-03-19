import type { CSSProperties, FC } from 'react';

export type HomeFooterProps = {
  variant: 'desktop' | 'mobile';
  onOpenPricing: () => void;
};

const renderGlowText = (text: string, startIndex: number) => {
  return text.split('').map((ch, i) => (
    <span
      key={`${startIndex + i}-${ch}`}
      className="homeGlowChar"
      style={{ ['--delay' as never]: `${(startIndex + i) * 75}ms` } as CSSProperties}
    >
      {ch === ' ' ? '\u00A0' : ch}
    </span>
  ));
};

export const HomeFooter: FC<HomeFooterProps> = (props) => {
  if (props.variant === 'desktop') {
    return (
      <>
        <div className="homeGoProPrompt" aria-label="Pricing prompt">
          <span className="homeGoProPromptText">{renderGlowText('Use it all for free. Someone might ', 0)}</span>
          <button
            type="button"
            className="homeGoProLink"
            onClick={props.onOpenPricing}
            aria-label="Open pricing"
          >
            {renderGlowText('go pro', 'Use it all for free. Someone might '.length)}
          </button>
          <span className="homeGoProPromptText">
            {renderGlowText('.', 'Use it all for free. Someone might '.length + 'go pro'.length)}
          </span>
        </div>

        <div className="homeUseItTag" aria-hidden="true">
          Edit PDFs Locally, Access Them Anywhere — The Complete All-In-One PDF Studio.
        </div>
      </>
    );
  }

  return (
    <footer className="homeMobileFooter" aria-label="Home footer">
      <div className="homeMobileFooterTagline">Edit PDFs Locally, Access Them Anywhere — The Complete All-In-One PDF Studio.</div>
      <button type="button" className="homeMobileFooterPricing" onClick={props.onOpenPricing}>
        Use it all for free. Someone might go pro.
      </button>
      <div className="homeMobileFooterPad" aria-hidden="true" />
    </footer>
  );
};
