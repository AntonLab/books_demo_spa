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

  it('resets Unsaved text when another tab clears the key (a Log out)', () => {
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
