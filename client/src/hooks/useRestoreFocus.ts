import { useEffect, useState } from 'react';

// Returns focus to the element focused when the component first rendered, once
// it unmounts. A modal mounted only while open skips antd's own restore.
// The opener is read during render: child effects (antd focusing the dialog)
// run before a parent's, so an effect would capture the dialog itself.
export const useRestoreFocus = (): void => {
  const [opener] = useState(() => document.activeElement);

  useEffect(
    () => () => {
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        !('disabled' in opener && opener.disabled)
      ) {
        opener.focus();
      }
    },
    [opener]
  );
};
