import React from 'react';
import './styles.css';

export type SpreadProps = {
  left: React.ReactNode;
  right: React.ReactNode;
};

export function Spread(props: SpreadProps) {
  return (
    <div className="spread-container">
      {props.left}
      {props.right}
      <div className="page-divider" aria-hidden="true" />
    </div>
  );
}
