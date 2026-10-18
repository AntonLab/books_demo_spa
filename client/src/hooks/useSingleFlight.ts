import { useRef } from 'react';

// Wraps an async action so a second call while the first has not settled is
// dropped. A ref, not state or isPending: those land after a render, so two
// events inside one frame (a double click) both pass. Cleared in `finally`, so
// a rejection also releases it; the rejection reaches the first caller only.
export const useSingleFlight = <A extends unknown[]>(
  fn: (...args: A) => Promise<void>
): ((...args: A) => Promise<void>) => {
  const inFlight = useRef(false);

  return async (...args: A) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await fn(...args);
    } finally {
      inFlight.current = false;
    }
  };
};
