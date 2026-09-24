import { createAppStore } from './index';
import { devicePreferences } from './devicePreferencesSlice';
import { unsavedText } from './unsavedTextSlice';
import { STORAGE_KEYS, loadPersistedState, persistNow } from './persistence';

const savedAt = '2026-09-23T10:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('persistence', () => {
  it('starts from the defaults when nothing is stored', () => {
    expect(loadPersistedState()).toEqual({});
    expect(createAppStore().getState().devicePreferences).toEqual({
      theme: 'light',
    });
  });

  it('ignores corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEYS.devicePreferences, '{not json');

    expect(loadPersistedState()).toEqual({});
  });

  it('ignores a stored value of the wrong shape', () => {
    localStorage.setItem(
      STORAGE_KEYS.devicePreferences,
      JSON.stringify({ theme: 'purple' })
    );

    expect(loadPersistedState()).toEqual({});
  });

  it('keeps working in memory when a write throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const store = createAppStore();

    expect(() =>
      store.dispatch(devicePreferences.themeToggled())
    ).not.toThrow();
    expect(store.getState().devicePreferences.theme).toBe('dark');
    // eslint-disable-next-line no-console
    expect(console.error).not.toHaveBeenCalled();
  });

  it('reads back what it wrote under the v1 key', () => {
    createAppStore().dispatch(devicePreferences.themeToggled());

    expect(localStorage.getItem('books.devicePreferences.v1')).toBe(
      JSON.stringify({ theme: 'dark' })
    );
    expect(createAppStore().getState().devicePreferences.theme).toBe('dark');
  });

  it('ignores stored Unsaved text of the wrong shape', () => {
    localStorage.setItem(
      STORAGE_KEYS.unsavedText,
      JSON.stringify({ entries: 'nope' })
    );

    expect(loadPersistedState()).toEqual({});
  });

  it('drops a stored entry whose text is not a string, keeping the rest', () => {
    localStorage.setItem(
      STORAGE_KEYS.unsavedText,
      JSON.stringify({
        accountId: null,
        entries: {
          bad: null,
          'book:1:comment': { text: 'Hello', savedAt },
        },
      })
    );

    expect(loadPersistedState()).toEqual({
      unsavedText: {
        accountId: null,
        entries: { 'book:1:comment': { text: 'Hello', savedAt } },
      },
    });
  });

  it('writes Unsaved text at most once per 500 ms, with the latest text', async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const store = createAppStore({});
    const writes = () =>
      setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.unsavedText);

    store.dispatch(unsavedText.upsert({ key: 'book:1:comment', text: 'H' }));
    store.dispatch(
      unsavedText.upsert({ key: 'book:1:comment', text: 'Hello' })
    );
    expect(writes()).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(500);

    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0]![1])).toMatchObject({
      entries: { 'book:1:comment': { text: 'Hello' } },
    });
  });

  it('round-trips Unsaved text under the v1 key', async () => {
    jest.useFakeTimers();
    const store = createAppStore({});
    store.dispatch(unsavedText.accountChanged(3));
    store.dispatch(
      unsavedText.upsert({ key: 'book:1:comment', text: 'Hello' })
    );
    await jest.advanceTimersByTimeAsync(500);

    expect(localStorage.getItem('books.unsavedText.v1')).not.toBeNull();
    expect(createAppStore().getState().unsavedText).toEqual(
      store.getState().unsavedText
    );
  });

  it('does not store a whitespace-only entry', () => {
    const store = createAppStore({});
    store.dispatch(unsavedText.upsert({ key: 'book:1:comment', text: ' ' }));

    persistNow(store.getState());

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.unsavedText)!)
    ).toMatchObject({ entries: {} });
  });

  it('writes both slices at once when the page is hidden', () => {
    const store = createAppStore({});
    store.dispatch(
      unsavedText.upsert({ key: 'book:1:comment', text: 'Hello' })
    );

    persistNow(store.getState());

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.unsavedText)!)
    ).toMatchObject({ entries: { 'book:1:comment': { text: 'Hello' } } });
  });
});
