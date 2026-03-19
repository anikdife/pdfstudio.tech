import React from 'react';
import logoUrl from '../../logo.svg';
import './styles.css';

export type PageProps = {
  side: 'left' | 'right';
  children?: React.ReactNode;
  watermarkSrc?: string;
};

export function Page(props: PageProps) {
  const watermarkSrc = props.watermarkSrc ?? logoUrl;

  return (
    <section className="page-base" data-side={props.side}>
      <div className="page-watermark" aria-hidden="true">
        <img src={watermarkSrc} alt="" />
      </div>
      <div className="page-content">{props.children}</div>
    </section>
  );
}
