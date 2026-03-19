import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import './styles.css';

export type InfoBookOverlayProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function InfoBookOverlay(props: InfoBookOverlayProps) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) props.onClose();
    },
    [props]
  );

  if (!props.open) return null;

  return createPortal(
    <div className="backdrop" role="dialog" aria-modal="true" onMouseDown={onMouseDown}>
      {props.children}
    </div>,
    document.body
  );
}
