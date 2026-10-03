import { renderHookWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import type { RootState } from '@/store';
import type { PublicUser } from '@/types/api';
import {
  useRecentlyViewedAccountBinding,
  useRecentlyViewedIds,
  useRecordRecentlyViewed,
} from './useRecentlyViewed';

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
  about: '',
  showLastSeen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// `undefined` leaves the session unanswered, as on a first render.
const withSession = (session: PublicUser | null | undefined) => {
  const queryClient = createTestQueryClient();
  if (session !== undefined) {
    queryClient.setQueryData(queryKeys.session, session);
  }
  return queryClient;
};

const heldBy = (
  accountId: number | null,
  ids = [2, 1]
): Partial<RootState> => ({ recentlyViewed: { accountId, ids } });

beforeEach(() => {
  jest.resetAllMocks();
  mockedAuth.me.mockReturnValue(new Promise(() => {}));
});

describe('useRecentlyViewedIds', () => {
  it('hides the history of another signed-in Account until accountChanged lands', () => {
    const { result } = renderHookWithProviders(() => useRecentlyViewedIds(), {
      queryClient: withSession(account(5)),
      preloadedState: heldBy(3),
    });
    expect(result.current).toEqual([]);
  });

  it('shows the history to its Account, to a Guest, and while either side is unknown', () => {
    const own = renderHookWithProviders(() => useRecentlyViewedIds(), {
      queryClient: withSession(account(3)),
      preloadedState: heldBy(3),
    });
    const guest = renderHookWithProviders(() => useRecentlyViewedIds(), {
      queryClient: withSession(null),
      preloadedState: heldBy(3),
    });
    const unowned = renderHookWithProviders(() => useRecentlyViewedIds(), {
      queryClient: withSession(account(5)),
      preloadedState: heldBy(null),
    });
    expect(own.result.current).toEqual([2, 1]);
    expect(guest.result.current).toEqual([2, 1]);
    expect(unowned.result.current).toEqual([2, 1]);
  });
});

describe('useRecordRecentlyViewed', () => {
  it('records a Published Book once', () => {
    const { store, rerender } = renderHookWithProviders(
      () => useRecordRecentlyViewed({ id: 7, status: 'in_progress' }),
      { queryClient: withSession(null), preloadedState: heldBy(null, [1]) }
    );
    rerender();
    expect(store.getState().recentlyViewed.ids).toEqual([7, 1]);
  });

  it('never records a Draft, nor before the Book has loaded', () => {
    const draft = renderHookWithProviders(
      () => useRecordRecentlyViewed({ id: 7, status: 'draft' }),
      { queryClient: withSession(account(3)), preloadedState: heldBy(3, [1]) }
    );
    const pending = renderHookWithProviders(
      () => useRecordRecentlyViewed(undefined),
      { queryClient: withSession(account(3)), preloadedState: heldBy(3, [1]) }
    );
    expect(draft.store.getState().recentlyViewed.ids).toEqual([1]);
    expect(pending.store.getState().recentlyViewed.ids).toEqual([1]);
  });

  it("records nothing into another Account's history while the binding has not cleared it", () => {
    const { store } = renderHookWithProviders(
      () => useRecordRecentlyViewed({ id: 7, status: 'complete' }),
      { queryClient: withSession(account(5)), preloadedState: heldBy(3) }
    );
    expect(store.getState().recentlyViewed).toEqual({
      accountId: 3,
      ids: [2, 1],
    });
  });

  it('records once the binding has cleared the other Account', () => {
    const { store } = renderHookWithProviders(
      () => {
        useRecentlyViewedAccountBinding();
        useRecordRecentlyViewed({ id: 7, status: 'complete' });
      },
      { queryClient: withSession(account(5)), preloadedState: heldBy(3) }
    );
    expect(store.getState().recentlyViewed).toEqual({
      accountId: 5,
      ids: [7],
    });
  });
});

describe('useRecentlyViewedAccountBinding', () => {
  it.each([
    [
      "carries a Guest's history over to the Account that signs in",
      account(1),
      null,
      1,
      [2, 1],
    ],
    [
      'keeps the history for the same Account as last time',
      account(1),
      1,
      1,
      [2, 1],
    ],
    ['clears the history for a different Account', account(2), 1, 2, []],
    ['keeps the history on Sign out (no session)', null, 1, 1, [2, 1]],
  ])('%s', (_name, session, heldAccount, accountId, ids) => {
    const { store } = renderHookWithProviders(
      () => useRecentlyViewedAccountBinding(),
      { queryClient: withSession(session), preloadedState: heldBy(heldAccount) }
    );
    expect(store.getState().recentlyViewed).toEqual({ accountId, ids });
  });
});
