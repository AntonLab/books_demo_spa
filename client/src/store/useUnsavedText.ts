import { useEffect } from 'react';
import { useLogout, useSession } from '@/queries/auth';
import { useAppDispatch, useAppSelector } from './hooks';
import { unsavedText } from './unsavedTextSlice';
import type {
  UnsavedTextEntry,
  UnsavedTextInput,
  UnsavedTextState,
} from './unsavedTextSlice';

// The client-side life cycle of Unsaved text (CONTEXT.md). Components read
// and write entries only through these hooks, never `state.unsavedText`, so
// none of them can show one Account's text to another.

const NO_ENTRIES: Record<string, UnsavedTextEntry> = {};

// The entries the signed-in Account may see. After a Lost session another
// Account can sign in with the slice still holding the first one's entries,
// and `useUnsavedTextAccountBinding`'s `accountChanged` clears them only
// after that render: a form seeded from them in the meantime would show the
// first Account's text. `null` on either side is no mismatch, as in
// `accountChanged`. The constant keeps the result stable for
// `useAppSelector`. Private, so nothing reads entries around these hooks.
const ownEntries = (
  state: { unsavedText: UnsavedTextState },
  sessionId: number | undefined
): Record<string, UnsavedTextEntry> => {
  const { accountId, entries } = state.unsavedText;
  return accountId !== null &&
    sessionId !== undefined &&
    accountId !== sessionId
    ? NO_ENTRIES
    : entries;
};

export interface UnsavedText {
  entry: UnsavedTextEntry | undefined;
  // `saved` is what the place holds now; text equal to it leaves no entry.
  write: (input: Omit<UnsavedTextInput, 'key'>) => void;
  discard: () => void;
}

// For a view over many places at once, such as every entry of a Book
// (`entriesOfBook`).
export const useOwnUnsavedEntries = (): Record<string, UnsavedTextEntry> => {
  const { data: session } = useSession();
  return useAppSelector((state) => ownEntries(state, session?.id));
};

export const useUnsavedText = (key: string): UnsavedText => {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  // One entry rather than the map, so typing in another place does not
  // re-render this one.
  const entry = useAppSelector((state) => ownEntries(state, session?.id)[key]);

  return {
    entry,
    write: (input) => {
      dispatch(unsavedText.upsert({ key, ...input }));
    },
    discard: () => {
      dispatch(unsavedText.remove(key));
    },
  };
};

// Called once, in AppShell, which is mounted on every route and so sees each
// sign-in. A different Account discards the previous one's Unsaved text. A
// Lost session (null) is not a Sign out and dispatches nothing, so the same
// Account gets its text back.
export const useUnsavedTextAccountBinding = (): void => {
  const userId = useSession().data?.id;
  const accountId = useAppSelector((state) => state.unsavedText.accountId);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (userId !== undefined && userId !== accountId) {
      dispatch(unsavedText.accountChanged(userId));
    }
  }, [userId, accountId, dispatch]);
};

// Only an explicit Sign out discards Unsaved text, and only once the server
// has ended the session. It lives here, not in `queries/auth`, because
// `queries/` never imports the store.
export const useSignOut = (): (() => void) => {
  const logout = useLogout();
  const dispatch = useAppDispatch();

  return () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        dispatch(unsavedText.discardAll());
      },
    });
  };
};
