import {
  entriesOfBook,
  ownEntries,
  unsavedText,
  unsavedTextKeys,
  unsavedTextReducer,
} from './unsavedTextSlice';
import type { UnsavedTextState } from './unsavedTextSlice';

const savedAt = '2026-09-23T10:00:00.000Z';
const withEntry = (accountId: number | null): UnsavedTextState => ({
  accountId,
  entries: { 'book:1:comment': { text: 'Half a thought', savedAt } },
});

describe('unsavedTextSlice', () => {
  it('builds every key under its Book', () => {
    expect(unsavedTextKeys.comment(1)).toBe('book:1:comment');
    expect(unsavedTextKeys.reply(1, 5)).toBe('book:1:reply:5');
    expect(unsavedTextKeys.commentEdit(1, 5)).toBe('book:1:commentEdit:5');
    expect(unsavedTextKeys.chapterNew(1)).toBe('book:1:chapterNew');
    expect(unsavedTextKeys.chapter(1, 9)).toBe('book:1:chapter:9');
  });

  it('upserts an entry and stamps when it was saved', () => {
    const state = unsavedTextReducer(
      undefined,
      unsavedText.upsert({ key: 'book:1:comment', text: 'Hello' })
    );

    expect(state.entries['book:1:comment']).toEqual({
      text: 'Hello',
      savedAt: expect.any(String),
    });
  });

  it('keeps whitespace as typed, so a leading space or Enter survives', () => {
    const state = unsavedTextReducer(
      undefined,
      unsavedText.upsert({ key: 'book:1:comment', text: ' ' })
    );

    expect(state.entries['book:1:comment']?.text).toBe(' ');
  });

  it('removes an entry cleared to nothing', () => {
    const state = unsavedTextReducer(
      withEntry(1),
      unsavedText.upsert({ key: 'book:1:comment', text: '' })
    );

    expect(state.entries).toEqual({});
  });

  it('removes an edit changed back to the text its place has saved', () => {
    const state = unsavedTextReducer(
      withEntry(1),
      unsavedText.upsert({
        key: 'book:1:comment',
        text: 'Saved words',
        saved: { text: 'Saved words' },
      })
    );

    expect(state.entries).toEqual({});
  });

  it('keeps an edit cleared to nothing, so the saved text stays away', () => {
    const state = unsavedTextReducer(
      undefined,
      unsavedText.upsert({
        key: 'book:1:commentEdit:5',
        text: '',
        saved: { text: 'Saved words' },
      })
    );

    expect(state.entries['book:1:commentEdit:5']?.text).toBe('');
  });

  it('compares a chapter edit by its title as well as its text', () => {
    const saved = { title: 'One', text: 'Saved words' };
    const same = unsavedTextReducer(
      undefined,
      unsavedText.upsert({ key: 'book:1:chapter:9', ...saved, saved })
    );
    const retitled = unsavedTextReducer(
      undefined,
      unsavedText.upsert({
        key: 'book:1:chapter:9',
        title: 'Two',
        text: 'Saved words',
        saved,
      })
    );

    expect(same.entries).toEqual({});
    expect(retitled.entries['book:1:chapter:9']?.title).toBe('Two');
  });

  it('keeps a chapter entry that has a title but no text yet', () => {
    const state = unsavedTextReducer(
      undefined,
      unsavedText.upsert({ key: 'book:1:chapterNew', title: 'One', text: '' })
    );

    expect(state.entries['book:1:chapterNew']).toMatchObject({
      title: 'One',
      text: '',
    });
  });

  it('removes one entry', () => {
    expect(
      unsavedTextReducer(withEntry(1), unsavedText.remove('book:1:comment'))
        .entries
    ).toEqual({});
  });

  it('rebases a chapter entry onto a newer version', () => {
    const state = unsavedTextReducer(
      {
        accountId: 1,
        entries: {
          'book:1:chapter:9': {
            title: 'One',
            text: 'Mine',
            baseUpdatedAt: '2026-09-01T00:00:00.000Z',
            savedAt,
          },
        },
      },
      unsavedText.rebase({
        key: 'book:1:chapter:9',
        baseUpdatedAt: '2026-09-02T00:00:00.000Z',
      })
    );

    expect(state.entries['book:1:chapter:9']?.baseUpdatedAt).toBe(
      '2026-09-02T00:00:00.000Z'
    );
  });

  it('discards every entry and the Account', () => {
    expect(unsavedTextReducer(withEntry(1), unsavedText.discardAll())).toEqual({
      accountId: null,
      entries: {},
    });
  });

  it('adopts the first Account it sees and keeps the entries', () => {
    expect(
      unsavedTextReducer(withEntry(null), unsavedText.accountChanged(1))
    ).toEqual(withEntry(1));
  });

  it('keeps the entries for the same Account', () => {
    expect(
      unsavedTextReducer(withEntry(1), unsavedText.accountChanged(1))
    ).toEqual(withEntry(1));
  });

  it('discards the entries when another Account signs in', () => {
    expect(
      unsavedTextReducer(withEntry(1), unsavedText.accountChanged(2))
    ).toEqual({ accountId: 2, entries: {} });
  });

  it('records a landed save: drops the entry when it holds what was sent', () => {
    const state = unsavedTextReducer(
      {
        accountId: 1,
        entries: {
          'book:1:chapter:9': {
            title: 'One',
            text: 'Sent',
            baseUpdatedAt: '2026-09-01T00:00:00.000Z',
            savedAt,
          },
        },
      },
      unsavedText.saved({
        key: 'book:1:chapter:9',
        title: 'One',
        text: 'Sent',
        updatedAt: '2026-09-02T00:00:00.000Z',
      })
    );

    expect(state.entries).toEqual({});
  });

  it('records a landed save: rebases text typed while it was in flight', () => {
    const state = unsavedTextReducer(
      {
        accountId: 1,
        entries: {
          'book:1:chapter:9': {
            title: 'One',
            text: 'Sent, and more',
            baseUpdatedAt: '2026-09-01T00:00:00.000Z',
            savedAt,
          },
        },
      },
      unsavedText.saved({
        key: 'book:1:chapter:9',
        title: 'One',
        text: 'Sent',
        updatedAt: '2026-09-02T00:00:00.000Z',
      })
    );

    expect(state.entries['book:1:chapter:9']).toMatchObject({
      text: 'Sent, and more',
      baseUpdatedAt: '2026-09-02T00:00:00.000Z',
    });
  });

  it('lists the entries of one Book only, skipping whitespace-only ones', () => {
    const entries = {
      'book:1:comment': { text: 'a', savedAt },
      'book:1:reply:5': { text: '  \n', savedAt },
      'book:12:comment': { text: 'b', savedAt },
    };

    expect(entriesOfBook(entries, 1)).toEqual([
      ['book:1:comment', { text: 'a', savedAt }],
    ]);
  });

  it("hides another signed-in Account's entries until accountChanged clears them", () => {
    const state = { unsavedText: withEntry(3) };

    expect(ownEntries(state, 5)).toEqual({});
    expect(ownEntries(state, 3)).toBe(state.unsavedText.entries);
    // Nobody signed in here yet, or no owner recorded: nothing to tell apart.
    expect(ownEntries(state, undefined)).toBe(state.unsavedText.entries);
    expect(ownEntries({ unsavedText: withEntry(null) }, 5)).toEqual(
      withEntry(null).entries
    );
  });
});
