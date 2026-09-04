import { QueryClient } from '@tanstack/react-query';

// A factory as well as a singleton, mirroring `createAppStore`/`store` in
// src/store/index.ts — and safe for the same reason that one is: there is no
// SSR here, so one client per process is one client per user.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // TanStack's default is three retries with exponential backoff, which
        // is wrong for this API: every error the client surfaces is a 4xx it
        // should show at once. A 401 from /auth/me is the *normal* answer for
        // an anonymous visitor and a 409 from register is a username
        // collision; retrying either spends three round trips reaching the
        // same conclusion. It also matches the thunks this replaces, none of
        // which retried anything.
        retry: false,
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
}

export const queryClient = createQueryClient();
