import { act } from '@testing-library/react';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useDebouncedValue';

// Real timers: lets a debounced search term settle and its query start.
export const waitPastDebounce = () =>
  act(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50)
      )
  );
