import React from 'react';

type PlanCardProps = {
  variant: 'pro' | 'corp';
  badge: string;
  title: string;
  price: string;
  priceSuffix: string;
  features: string[];
  cta: string;
  onClick?: () => void;
};

function PlanCard(props: PlanCardProps) {
  return (
    <div className={`homePricingCard homePricingCard-${props.variant}`}
      role="group"
      aria-label={props.title}
    >
      <div className="homePricingBadge">{props.badge}</div>
      <div className="homePricingTitle">{props.title}</div>

      <div className="homePricingPrice">
        {props.price}
        <span className="homePricingPriceSuffix">{props.priceSuffix}</span>
      </div>

      <ul className="homePricingFeatures">
        {props.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <button
        type="button"
        className={`homePricingBtn homePricingBtn-${props.variant}`}
        onClick={props.onClick}
      >
        {props.cta}
      </button>
    </div>
  );
}

export function HomePricingCards() {
  return (
    <div className="homePricingGrid" aria-label="Plans">
      <PlanCard
        variant="pro"
        badge="Individual"
        title="Studio Pro"
        price="$9"
        priceSuffix="/mo"
        features={[
          'On-device workflows (privacy-first)',
          'Advanced typography (your local font friendly)',
          'Offline-ready editing & export',
          'PDF form',
          'Premium tools & presets',
        ]}
        cta="email sales@pdfstudio.tech"
        onClick={() => {
          window.open('mailto:sales@pdfstudio.tech?subject=Studio%20Pro%20Inquiry', '_self');
        }}
      />

      <PlanCard
        variant="corp"
        badge="Business"
        title="Corporate Studio"
        price="$49"
        priceSuffix="/mo"
        features={[
          'Bulk signatures & review workflows',
          'Team controls & activity logs',
          'Priority support',
          'PDF form',
          'Advanced redaction tools',
        ]}
        cta="email sales@pdfstudio.tech"
        onClick={() => {
          window.open('mailto:sales@pdfstudio.tech?subject=Corporate%20Studio%20Inquiry', '_self');
        }}
      />
    </div>
  );
}
