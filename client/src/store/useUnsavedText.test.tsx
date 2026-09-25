import { act, waitFor } from '@testing-library/react';
import {
  useOwnUnsavedEntries,
  useSignOut,
  useUnsavedText,
  useUnsavedTextAccountBinding,
} from './useUnsavedText';
import { renderHookWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as authApi from '@/api/auth';
import type { RootState } from '@/store';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);

const account = (id: number): PublicUser => ({
  id,
  login: `user${id}`,
  email: `user${id}@example.com`,
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const savedAt = '2026-09-23T10:00:00.000Z';
const entries = { 'book:1:comment': { text: 'Half a thought', savedAt } };
const ownedBy = (accountId: number | null): Partial<RootState> => ({
  unsavedText: { accountId, entries },
});

// `undefined` leaves the session unanswered, as on a first render.
const withSession = (session: PublicUser | null | undefined) => {
  const queryClient = createTestQueryClient();
  if (session !== undefined) {
    queryClient.setQueryData(queryKeys.session, session);
  }
  return queryClient;
};

const useBoth = (key: string) => ({
  one: useUnsavedText(key),
  all: useOwnUnsavedEntries(),
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useUnsavedText and useOwnUnsavedEntries', () => {
  it("hide another signed-in Account's entries until accountChanged lands", () => {
    // Account 3 lost its session without Sign out; Account 5 signed in on the
    // same device, and the binding has not run yet.
    const { result } = renderHookWithProviders(
      () => useBoth('book:1:comment'),
      { queryClient: withSession(account(5)), preloadedState: ownedBy(3) }
    );

    expect(result.current.one.entry).toBeUndefined();
    expect(result.current.all).toEqual({});
  });

  it('show the entries to the Account they belong to', () => {
    const { result } = renderHookWithProviders(
      () => useBoth('book:1:comment'),
      { queryClient: withSession(account(3)), preloadedState: ownedBy(3) }
    );

    expect(result.current.one.entry?.text).toBe('Half a thought');
    expect(result.current.all).toEqual(entries);
  });

  it('show the entries while either side has no Account yet', () => {
    mockedAuth.me.mockReturnValue(new Promise(() => {}));
    const unanswered = renderHookWithProviders(() => useOwnUnsavedEntries(), {
      queryClient: withSession(undefined),
      preloadedState: ownedBy(3),
    });
    const unowned = renderHookWithProviders(() => useOwnUnsavedEntries(), {
      queryClient: withSession(account(5)),
      preloadedState: ownedBy(null),
    });

    expect(unanswered.result.current).toEqual(entries);
    expect(unowned.result.current).toEqual(entries);
  });

  it('writes and discards only its own entry', () => {
    const { result, store } = renderHookWithProviders(
      () => useUnsavedText('book:1:reply:5'),
      { queryClient: withSession(account(3)), preloadedState: ownedBy(3) }
    );

    act(() => result.current.write({ text: 'On second thought' }));
    expect(result.current.entry?.text).toBe('On second thought');

    act(() => result.current.discard());
    expect(result.current.entry).toBeUndefined();
    expect(store.getState().unsavedText.entries).toEqual(entries);
  });
});

describe('useUnsavedTextAccountBinding', () => {
  it('adopts the first Account signed in, keeping the entries', () => {
    const { store } = renderHookWithProviders(
      () => useUnsavedTextAccountBinding(),
      { queryClient: withSession(account(1)), preloadedState: ownedBy(null) }
    );

    expect(store.getState().unsavedText).toEqual({ accountId: 1, entries });
  });

  it('discards the entries when a different Account is signed in', () => {
    const { store } = renderHookWithProviders(
      () => useUnsavedTextAccountBinding(),
      { queryClient: withSession(account(1)), preloadedState: ownedBy(2) }
    );

    expect(store.getState().unsavedText).toEqual({
      accountId: 1,
      entries: {},
    });
  });

  it('keeps the entries through a Lost session', () => {
    const queryClient = withSession(account(1));
    const { store } = renderHookWithProviders(
      () => useUnsavedTextAccountBinding(),
      { queryClient, preloadedState: ownedBy(1) }
    );

    // An expiry, a Block or a password reset: the session just becomes null.
    act(() => {
      queryClient.setQueryData(queryKeys.session, null);
    });

    expect(store.getState().unsavedText).toEqual({ accountId: 1, entries });
  });
});

describe('useSignOut', () => {
  it('discards every entry only once the server has signed out', async () => {
    let land: () => void = () => {};
    mockedAuth.logout.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          land = () => resolve();
        })
    );
    const { result, store } = renderHookWithProviders(() => useSignOut(), {
      queryClient: withSession(account(1)),
      preloadedState: ownedBy(1),
    });

    act(() => result.current());
    await waitFor(() => expect(mockedAuth.logout).toHaveBeenCalledTimes(1));
    expect(store.getState().unsavedText).toEqual({ accountId: 1, entries });

    await act(async () => land());

    await waitFor(() =>
      expect(store.getState().unsavedText).toEqual({
        accountId: null,
        entries: {},
      })
    );
  });

  it('keeps every entry when the sign out fails', async () => {
    mockedAuth.logout.mockRejectedValue(new ApiError(500, 'Server error'));
    const { result, store } = renderHookWithProviders(() => useSignOut(), {
      queryClient: withSession(account(1)),
      preloadedState: ownedBy(1),
    });

    act(() => result.current());
    await waitFor(() => expect(mockedAuth.logout).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(store.getState().unsavedText).toEqual({ accountId: 1, entries });
  });
});
