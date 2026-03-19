import { useState } from 'react';
import { InfoBook } from './InfoBook';

export type InfoBookTriggerProps = {
  label?: string;
  className?: string;
};

export function InfoBookTrigger(props: InfoBookTriggerProps) {
  const { label = 'Info', className } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <InfoBook open={open} onClose={() => setOpen(false)} />
    </>
  );
}
