import { createAppStore, syncFromStorageEvent } from './index';
import { unsavedText } from './unsavedTextSlice';
import { STORAGE_KEYS } from './persistence';

const savedAt = '2026-09-23T10:00:00.000Z';

describe('cross-tab sync', () => {
  it("replaces this tab's Unsaved text with another tab's value", () => {
    const store = createAppStore({});
    const fromOtherTab = {
      accountId: 3,
      entries: { 'book:1:comment': { text: 'From tab B', savedAt } },
    };

    syncFromStorageEvent(
      store,
      new StorageEvent('storage', {
        key: STORAGE_KEYS.unsavedText,
        newValue: JSON.stringify(fromOtherTab),
      })
    );

    expect(store.getState().unsavedText).toEqual(fromOtherTab);
  });

  it("keeps this tab's Unsaved text when another tab shows a different signed-in Account", () => {
    const store = createAppStore({});
    store.dispatch(unsavedText.accountChanged(3));
    store.dispatch(unsavedText.upsert({ key: 'book:1:comment', text: 'Mine' }));
    const before = store.getState().unsavedText;

    syncFromStorageEvent(
      store,
      new StorageEvent('storage', {
        key: STORAGE_KEYS.unsavedText,
        newValue: JSON.stringify({
          accountId: 5,
          entries: { 'book:1:comment': { text: 'Theirs', savedAt } },
        }),
      })
    );

    // Replacing it here would make the Account binding's accountChanged wipe
    // it back to Account 3 and write that back, which the other tab would
    // then replace again — a loop between two Accounts that wipes Unsaved
    // text every round.
    expect(store.getState().unsavedText).toEqual(before);
  });

  it('resets Unsaved text when another tab removes the key (a null newValue)', () => {
    const store = createAppStore({});
    store.dispatch(
      unsavedText.upsert({ key: 'book:1:comment', text: 'Local text' })
    );

    syncFromStorageEvent(
      store,
      new StorageEvent('storage', {
        key: STORAGE_KEYS.unsavedText,
        newValue: null,
      })
    );

    expect(store.getState().unsavedText).toEqual({
      accountId: null,
      entries: {},
    });
  });

  it("takes another tab's theme, and the default when that tab clears it", () => {
    const store = createAppStore({});

    syncFromStorageEvent(store, {
      key: STORAGE_KEYS.devicePreferences,
      newValue: JSON.stringify({ theme: 'dark' }),
    });
    expect(store.getState().devicePreferences.theme).toBe('dark');

    syncFromStorageEvent(store, {
      key: STORAGE_KEYS.devicePreferences,
      newValue: null,
    });
    expect(store.getState().devicePreferences.theme).toBe('light');
  });

  it('ignores a corrupt value from another tab', () => {
    const store = createAppStore({});
    store.dispatch(
      unsavedText.upsert({ key: 'book:1:comment', text: 'Local text' })
    );

    syncFromStorageEvent(
      store,
      new StorageEvent('storage', {
        key: STORAGE_KEYS.unsavedText,
        newValue: '{not json',
      })
    );

    expect(store.getState().unsavedText.entries['book:1:comment']?.text).toBe(
      'Local text'
    );
  });
});
