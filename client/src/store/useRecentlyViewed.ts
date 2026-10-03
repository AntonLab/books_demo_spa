import { useEffect } from 'react';
import type { BookStatus } from 'shared';
import { useSession } from '@/queries/auth';
import { useAppDispatch, useAppSelector } from './hooks';
import { recentlyViewed } from './recentlyViewedSlice';
import type { RecentlyViewedState } from './recentlyViewedSlice';

// The client-side life cycle of Recently viewed (CONTEXT.md). Components read
// and write the history only through these hooks, never
// `state.recentlyViewed`, so none of them can show one Account's history to
// another.

const NO_IDS: number[] = [];

// Another Account's history, not yet cleared. After a Lost session another
// Account can sign in with the slice still holding the first one's ids, and
// `useRecentlyViewedAccountBinding`'s `accountChanged` clears them only after
// that render, so the first Account's ids must not show in the gap. `null` on
// either side is no mismatch, as in `accountChanged`.
const heldByAnother = (
  { accountId }: RecentlyViewedState,
  sessionId: number | undefined
): boolean =>
  accountId !== null && sessionId !== undefined && accountId !== sessionId;

// Newest first. The constant keeps the empty result stable for
// `useAppSelector`.
export const useRecentlyViewedIds = (): number[] => {
  const sessionId = useSession().data?.id;
  return useAppSelector((state) =>
    heldByAnother(state.recentlyViewed, sessionId)
      ? NO_IDS
      : state.recentlyViewed.ids
  );
};

// A Draft is not Recently viewed material. Dependencies are primitives so a
// refetch of the Book does not record it again.
export const useRecordRecentlyViewed = (
  book: { id: number; status: BookStatus } | undefined
): void => {
  const sessionId = useSession().data?.id;
  // Effects of a page run before AppShell's, and `accountChanged` would wipe a
  // Book recorded before it clears the other Account's history. `blocked`
  // turning false after the clear records the open Book.
  const blocked = useAppSelector((state) =>
    heldByAnother(state.recentlyViewed, sessionId)
  );
  const dispatch = useAppDispatch();
  const id = book?.id;
  const status = book?.status;

  useEffect(() => {
    if (id !== undefined && status !== 'draft' && !blocked) {
      dispatch(recentlyViewed.record(id));
    }
  }, [id, status, blocked, dispatch]);
};

// Called once, in AppShell, which is mounted on every route and so sees each
// sign-in. A different Account discards the previous one's history; a Guest's
// goes to the Account that signs in. No session (Sign out, Lost session)
// dispatches nothing, so the history stays.
export const useRecentlyViewedAccountBinding = (): void => {
  const userId = useSession().data?.id;
  const accountId = useAppSelector((state) => state.recentlyViewed.accountId);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (userId !== undefined && userId !== accountId) {
      dispatch(recentlyViewed.accountChanged(userId));
    }
  }, [userId, accountId, dispatch]);
};
