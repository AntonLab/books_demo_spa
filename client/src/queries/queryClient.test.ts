import { ApiError } from '@/api/client';
import { createQueryClient, shouldRetryQuery } from './queryClient';

describe('shouldRetryQuery', () => {
  it('retries a failure that never reached the API, at most twice', () => {
    const offline = new TypeError('Failed to fetch');

    expect(shouldRetryQuery(0, offline)).toBe(true);
    expect(shouldRetryQuery(1, offline)).toBe(true);
    expect(shouldRetryQuery(2, offline)).toBe(false);
  });

  it('retries a 5xx, at most twice', () => {
    for (const status of [500, 502, 503]) {
      const error = new ApiError(status, 'Server error');

      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(false);
    }
  });

  it('never retries a 4xx, the anonymous 401 from /auth/me included', () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetryQuery(0, new ApiError(status, 'No'))).toBe(false);
    }
  });
});

describe('createQueryClient', () => {
  it('retries queries by that rule and never retries a mutation', () => {
    const options = createQueryClient().getDefaultOptions();

    expect(options.queries?.retry).toBe(shouldRetryQuery);
    expect(options.mutations?.retry).toBe(false);
  });

  it('keeps the 30-second staleTime and no refetch on focus', () => {
    const options = createQueryClient().getDefaultOptions();

    expect(options.queries?.staleTime).toBe(30_000);
    expect(options.queries?.refetchOnWindowFocus).toBe(false);
  });
});
