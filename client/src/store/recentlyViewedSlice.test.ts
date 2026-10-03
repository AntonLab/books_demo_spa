import { BOOK_IDS_MAX } from 'shared';
import { recentlyViewed, recentlyViewedReducer } from './recentlyViewedSlice';
import type { RecentlyViewedState } from './recentlyViewedSlice';

const held = (
  accountId: number | null,
  ids: number[]
): RecentlyViewedState => ({ accountId, ids });

const reduce = (
  state: RecentlyViewedState,
  action: Parameters<typeof recentlyViewedReducer>[1]
) => recentlyViewedReducer(state, action);

describe('recentlyViewedSlice', () => {
  it('records a Book at the front, and a re-opened one moves there once', () => {
    const recorded = reduce(held(null, [2, 1]), recentlyViewed.record(3));
    expect(recorded.ids).toEqual([3, 2, 1]);
    expect(reduce(recorded, recentlyViewed.record(1)).ids).toEqual([1, 3, 2]);
  });

  it('keeps only the newest BOOK_IDS_MAX ids', () => {
    const full = Array.from({ length: BOOK_IDS_MAX }, (_, index) => index + 1);
    const { ids } = reduce(held(null, full), recentlyViewed.record(100));

    expect(ids).toHaveLength(BOOK_IDS_MAX);
    expect(ids[0]).toBe(100);
  });

  it.each([
    ["adopts a Guest's history for the Account that signs in", null, 3, [2, 1]],
    ['keeps the history for the same Account', 3, 3, [2, 1]],
    ['clears the history for a different Account', 3, 5, []],
  ])('%s', (_name, last, signedIn, ids) => {
    expect(
      reduce(held(last, [2, 1]), recentlyViewed.accountChanged(signedIn))
    ).toEqual(held(signedIn, ids));
  });

  it("takes another tab's value, and resets on null", () => {
    const other = held(3, [9]);
    expect(reduce(held(null, [1]), recentlyViewed.replaced(other))).toEqual(
      other
    );
    expect(reduce(other, recentlyViewed.replaced(null))).toEqual(
      held(null, [])
    );
  });
});
