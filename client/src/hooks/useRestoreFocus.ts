import { useEffect, useRef } from 'react';

// Returns focus to the element that had it when the calling component first
// rendered, once the component unmounts. A modal mounted only while open skips
// antd's own restore, which runs when `open` flips to false.
//
// The opener is read during the first render, not in an effect: child effects
// (antd moving focus into the dialog) run before a parent's, so an effect
// would capture the dialog itself.
export const useRestoreFocus = (): void => {
  const opener = useRef<Element | null | undefined>(undefined);
  opener.current ??= document.activeElement;

  useEffect(() => {
    const el = opener.current;
    return () => {
      if (
        el instanceof HTMLElement &&
        el.isConnected &&
        !('disabled' in el && el.disabled)
      ) {
        el.focus();
      }
    };
  }, []);
};
