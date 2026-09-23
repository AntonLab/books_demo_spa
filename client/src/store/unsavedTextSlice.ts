import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// Unsaved text (CONTEXT.md): what an Account typed and has not sent, one entry
// per place it was typed. Every key starts with `book:{bookId}:`, so a page
// whose Book is gone can find all of that Book's entries.
export const unsavedTextKeys = {
  comment: (bookId: number) => `book:${bookId}:comment`,
  reply: (bookId: number, commentId: number) =>
    `book:${bookId}:reply:${commentId}`,
  commentEdit: (bookId: number, commentId: number) =>
    `book:${bookId}:commentEdit:${commentId}`,
  chapterNew: (bookId: number) => `book:${bookId}:chapterNew`,
  chapter: (bookId: number, chapterId: number) =>
    `book:${bookId}:chapter:${chapterId}`,
};

export interface UnsavedTextEntry {
  text: string;
  // Chapters only.
  title?: string;
  // Edits of an existing Chapter only: the `updatedAt` of the version the
  // typing started from. A save sends it, so a Co-author's newer save answers
  // 409 instead of being overwritten.
  baseUpdatedAt?: string;
  savedAt: string;
}

export interface UnsavedTextState {
  // The Account the entries belong to; null until one is seen signed in.
  accountId: number | null;
  entries: Record<string, UnsavedTextEntry>;
}

export type UnsavedTextInput = Omit<UnsavedTextEntry, 'savedAt'> & {
  key: string;
};

const initialState: UnsavedTextState = { accountId: null, entries: {} };

// Nothing worth offering back. The state still keeps such an entry: dropping
// it there would reset a field to empty the moment its first keystroke is a
// space or an Enter. Storage and the notices skip it instead.
export const isBlank = ({
  text,
  title = '',
}: Pick<UnsavedTextEntry, 'text' | 'title'>): boolean =>
  text.trim() === '' && title.trim() === '';

const slice = createSlice({
  name: 'unsavedText',
  initialState,
  reducers: {
    upsert: {
      reducer(
        state,
        action: PayloadAction<UnsavedTextInput & { savedAt: string }>
      ) {
        const { key, ...entry } = action.payload;
        if (entry.text === '' && (entry.title ?? '') === '') {
          delete state.entries[key];
          return;
        }
        state.entries[key] = entry;
      },
      // The clock is read here so the reducer stays pure.
      prepare(input: UnsavedTextInput) {
        return { payload: { ...input, savedAt: new Date().toISOString() } };
      },
    },
    remove(state, action: PayloadAction<string>) {
      delete state.entries[action.payload];
    },
    rebase(
      state,
      action: PayloadAction<{ key: string; baseUpdatedAt: string }>
    ) {
      const entry = state.entries[action.payload.key];
      if (entry) entry.baseUpdatedAt = action.payload.baseUpdatedAt;
    },
    // A Chapter save landed. An entry still holding exactly what was sent is
    // done. One that changed while the save was in flight stays, now based on
    // the version that save created: its base is the Account's own save, so
    // keeping the old one would show a false conflict.
    saved(
      state,
      action: PayloadAction<{
        key: string;
        title: string;
        text: string;
        updatedAt: string;
      }>
    ) {
      const { key, title, text, updatedAt } = action.payload;
      const entry = state.entries[key];
      if (!entry) return;
      if (entry.text === text && (entry.title ?? '') === title) {
        delete state.entries[key];
      } else {
        entry.baseUpdatedAt = updatedAt;
      }
    },
    discardAll() {
      return initialState;
    },
    // Entries follow the Account, not the session: a lost session dispatches
    // nothing, so the same Account signing back in gets its text back.
    accountChanged(state, action: PayloadAction<number>) {
      if (state.accountId !== null && state.accountId !== action.payload) {
        state.entries = {};
      }
      state.accountId = action.payload;
    },
  },
});

export const unsavedText = slice.actions;
export const unsavedTextReducer = slice.reducer;

export const entriesOfBook = (
  entries: Record<string, UnsavedTextEntry>,
  bookId: number
): [string, UnsavedTextEntry][] =>
  Object.entries(entries).filter(
    ([key, entry]) => key.startsWith(`book:${bookId}:`) && !isBlank(entry)
  );
