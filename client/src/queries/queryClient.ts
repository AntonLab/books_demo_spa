import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { watchSession } from './auth';

const MAX_QUERY_RETRIES = 2;

// Whether a failed query is asked again. Only a failure that may pass on its
// own is: one that never got an answer from the API — fetch rejected, so it
// is no ApiError (the network, a dropped connection) — or a 5xx. Any other
// status is the API's considered answer and is shown at once: a 401 from
// /auth/me is the normal answer for an anonymous visitor, a 404 a missing
// book, a 409 a taken login, and asking again reaches the same conclusion.
// At most twice, with TanStack's default backoff between tries; TanStack
// passes 0 on the first failure. Exported for its test.
export const shouldRetryQuery = (
  failureCount: number,
  error: unknown
): boolean =>
  failureCount < MAX_QUERY_RETRIES &&
  (!(error instanceof ApiError) || error.status >= 500);

// A factory as well as a singleton: tests need a fresh client each, and the
// singleton is safe because there is no SSR here, so one client per process
// is one client per user.
export const createQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        // The thunks never refetched on focus. Turning it on would be a
        // behaviour change, and this migration is not making any.
        refetchOnWindowFocus: false,
        // The default of 0 marks data stale the instant it arrives, so every
        // remount refetches — exactly the behaviour this change exists to
        // stop. Thirty seconds makes navigating home and back free without
        // anything looking frozen.
        staleTime: 30_000,
      },
    },
  });
};

export const queryClient = createQueryClient();

watchSession(
  queryClient,
  typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel('books.session')
);
