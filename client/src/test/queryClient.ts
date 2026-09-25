import { QueryClient } from '@tanstack/react-query';

// Deliberately not the app's client. Three differences, each load-bearing in
// tests:
//
// - `retry: false` so a rejected queryFn fails the assertion immediately
//   rather than after the app's retries and their backoff.
// - `staleTime: Infinity` so data a test seeds with `setQueryData` is never
//   refetched behind its back. Without it a seeded query would fire its real
//   queryFn on mount, and an auto-mocked api module returns `undefined`,
//   which TanStack rejects outright.
// - `gcTime: Infinity` so no garbage-collection timer outlives the test and
//   keeps a Jest worker handle open.
export const createTestQueryClient = (): QueryClient => {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
};
