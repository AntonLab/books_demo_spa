import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './useClearable.module.css';

type KeyDown = (event: KeyboardEvent<HTMLDivElement>) => void;

export interface UseClearableInput {
  value?: number;
  onChange?: (value: number | undefined) => void;
  onKeyDown?: KeyDown;
  onOpenChange?: (open: boolean) => void;
}

export interface ClearableProps {
  className: string | undefined;
  allowClear: true;
  open: boolean;
  onKeyDown: KeyDown;
  onOpenChange: (open: boolean) => void;
}

// antd draws its clear icon only on hover and makes it unfocusable, so a
// keyboard user could not empty the select: the icon stays visible while there
// is a value, and Delete or Backspace on the focused, closed select clears it.
// rc-select opens on Delete in the input's keydown handler, which runs before
// this root handler, so `preventDefault` cannot stop it. The hook owns `open`
// and resets it to false in the same batch after a clear.
// Precondition: only for selects without `showSearch`, since typed text would
// collide with Backspace.
export const useClearable = ({
  value,
  onChange,
  onKeyDown,
  onOpenChange,
}: UseClearableInput): ClearableProps => {
  const [open, setOpen] = useState(false);

  return {
    className: styles.select,
    allowClear: true,
    open,
    onKeyDown: (event) => {
      onKeyDown?.(event);
      if (
        !open &&
        value !== undefined &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault();
        setOpen(false);
        onChange?.(undefined);
      }
    },
    onOpenChange: (next) => {
      setOpen(next);
      onOpenChange?.(next);
    },
  };
};
