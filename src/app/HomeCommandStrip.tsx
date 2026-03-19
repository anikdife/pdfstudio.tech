import React from 'react';

type StripButtonProps = {
  id: string;
  label: string;
  transform: string;
  onClick: () => void;
  children: React.ReactNode;
};

function StripButton(props: StripButtonProps) {
  return (
    <g
      className="homeStripBtn"
      id={props.id}
      transform={props.transform}
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        }
      }}
    >
      <rect className="homeStripBtnRect" x="0" y="0" width="96" height="50" rx="6" transform="skewX(-40)" />
      {props.children}
      <text x="20" y="68" className="homeStripLabel">
        {props.label}
      </text>
    </g>
  );
}

export function HomeCommandStrip(props: {
  onGoogleLogin: () => void;
  onInfo: () => void;
  onOpenFile: () => void;
  onNewDoc: () => void;
  onTryIt: () => void;
}) {
  return (
    <div className="homeStripScene">
      <svg
        className="homeStripSvg"
        width="1000"
        height="400"
        viewBox="0 0 1000 400"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Home command strip"
      >
        <path
          className="homeStripThickness"
          d="M 100,250 L 400,250 L 500,80 L 600,250 L 900,250 v 15 L 600,265 L 500,95 L 400,265 L 100,265 Z"
        />

        <path className="homeStripSurface" d="M 100,250 L 400,250 L 430,220 L 130,220 Z" />
        <path className="homeStripSurface homeStripSlopeUp" d="M 400,250 L 500,80 L 530,50 L 430,220 Z" />
        <path className="homeStripSurface homeStripSlopeDown" d="M 500,80 L 600,250 L 630,220 L 530,50 Z" />
        <path className="homeStripSurface" d="M 600,250 L 900,250 L 930,220 L 630,220 Z" />

        <StripButton id="info" label="Info" transform="translate(300, 225)" onClick={props.onInfo}>
          <g transform="translate(18, 10)" aria-hidden="true">
            <circle cx="28" cy="25" r="10" className="homeStripIconPath" />
            <path className="homeStripIconPath" d="M28 24 v7" />
            <path className="homeStripIconPath" d="M28 19 v0" />
            <circle cx="28" cy="19" r="1.2" fill="rgba(255, 255, 255, 0.92)" />
          </g>
        </StripButton>

        <StripButton id="try-it" label="Try it" transform="translate(650, 225)" onClick={props.onTryIt}>
          <path className="homeStripIconPath" d="M18 16h16v20H18z" />
          <path className="homeStripIconPath" d="M26 22l8 6-8 6z" />
        </StripButton>

        {/* Title removed */}
      </svg>
    </div>
  );
}
