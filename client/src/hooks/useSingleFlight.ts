import { useRef } from 'react';

// Wraps an async action so a second call while the first has not settled is
// dropped. With `keyOf` (a key from the call's args) only a call whose key is
// already in flight is dropped; other keys run side by side. A ref, not state
// or isPending: those land after a render, so two events inside one frame (a
// double click) both pass. Cleared in `finally`, so a rejection also releases
// it; the rejection reaches the first caller only.
export const useSingleFlight = <A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
  keyOf: (...args: A) => unknown = () => undefined
): ((...args: A) => Promise<void>) => {
  const inFlight = useRef(new Set<unknown>());

  return async (...args: A) => {
    const key = keyOf(...args);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      await fn(...args);
    } finally {
      inFlight.current.delete(key);
    }
  };
};
