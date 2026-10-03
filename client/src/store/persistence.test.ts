import { createAppStore } from './index';
import {
  devicePreferences,
  initialDevicePreferences,
  initialReadingPreferences,
} from './devicePreferencesSlice';
import { BOOK_IDS_MAX } from 'shared';
import { recentlyViewed } from './recentlyViewedSlice';
import { unsavedText } from './unsavedTextSlice';
import {
  STORAGE_KEYS,
  loadPersistedState,
  parsePersisted,
  persistNow,
} from './persistence';

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
    expect(createAppStore().getState().devicePreferences).toEqual(
      initialDevicePreferences
    );
  });

  // An added field does not bump the key: a value stored before it existed is
  // read with the field's default, so nobody loses the theme they chose.
  it('reads a value stored before the results layout existed as a grid', () => {
    localStorage.setItem(
      STORAGE_KEYS.devicePreferences,
      JSON.stringify({ theme: 'dark' })
    );

    expect(loadPersistedState().devicePreferences).toEqual({
      ...initialDevicePreferences,
      theme: 'dark',
    });
  });

  it('keeps the theme when the stored results layout is unknown', () => {
    const raw = JSON.stringify({ theme: 'dark', resultsLayout: 'carousel' });

    expect(
      parsePersisted(STORAGE_KEYS.devicePreferences, raw)?.devicePreferences
    ).toEqual({ ...initialDevicePreferences, theme: 'dark' });
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

  it('reads a value stored before the search form preference existed as open', () => {
    localStorage.setItem(
      STORAGE_KEYS.devicePreferences,
      JSON.stringify({ theme: 'dark', resultsLayout: 'list' })
    );

    expect(loadPersistedState().devicePreferences).toEqual({
      ...initialDevicePreferences,
      theme: 'dark',
      resultsLayout: 'list',
    });
  });

  it('keeps a stored closed search form', () => {
    const raw = JSON.stringify({
      theme: 'light',
      resultsLayout: 'grid',
      searchFormExpanded: false,
    });

    expect(
      parsePersisted(STORAGE_KEYS.devicePreferences, raw)?.devicePreferences
        ?.searchFormExpanded
    ).toBe(false);
  });

  it('reads reading preferences field by field, dropping only unknown ones', () => {
    const raw = JSON.stringify({
      theme: 'light',
      reading: {
        background: 'sepia',
        font: 'comic',
        fontSize: 15,
        width: 'full',
      },
    });

    expect(
      parsePersisted(STORAGE_KEYS.devicePreferences, raw)?.devicePreferences
        ?.reading
    ).toEqual({
      ...initialReadingPreferences,
      background: 'sepia',
      width: 'full',
    });
  });

  it('reads reading preferences stored before the layout existed as scroll', () => {
    const raw = JSON.stringify({
      theme: 'light',
      reading: { background: 'sepia' },
    });

    expect(
      parsePersisted(STORAGE_KEYS.devicePreferences, raw)?.devicePreferences
        ?.reading.layout
    ).toBe('scroll');
  });

  it('keeps a stored pages layout and drops an unknown one', () => {
    const read = (layout: string) =>
      parsePersisted(
        STORAGE_KEYS.devicePreferences,
        JSON.stringify({ theme: 'light', reading: { layout } })
      )?.devicePreferences?.reading.layout;

    expect(read('pages')).toBe('pages');
    expect(read('book')).toBe('scroll');
  });

  it('reads back what it wrote under the v1 key', () => {
    createAppStore().dispatch(devicePreferences.themeToggled());

    expect(localStorage.getItem('books.devicePreferences.v1')).toBe(
      JSON.stringify({ ...initialDevicePreferences, theme: 'dark' })
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

  it.each([
    [STORAGE_KEYS.devicePreferences, { theme: 42 }],
    [STORAGE_KEYS.unsavedText, { accountId: 1, entries: [] }],
  ])('ignores valid JSON of the wrong shape under %s', (key, value) => {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);

    expect(parsePersisted(key, raw)).toBeUndefined();
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

  it("does not write back another tab's Unsaved text", async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const store = createAppStore({});

    store.dispatch(
      unsavedText.replaced({
        accountId: 3,
        entries: { 'book:1:comment': { text: 'From tab B', savedAt } },
      })
    );
    await jest.advanceTimersByTimeAsync(500);

    // The value came from storage; writing it back 500 ms later could
    // overwrite a newer one the other tab wrote in between.
    expect(
      setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.unsavedText)
    ).toHaveLength(0);
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

  it('reads a stored history back under the v1 key', () => {
    localStorage.setItem(
      'books.recentlyViewed.v1',
      JSON.stringify({ accountId: 3, ids: [5, 2] })
    );

    expect(loadPersistedState().recentlyViewed).toEqual({
      accountId: 3,
      ids: [5, 2],
    });
  });

  it('cleans stored ids: integers above zero only, no repeats, at most BOOK_IDS_MAX', () => {
    const many = Array.from({ length: BOOK_IDS_MAX + 5 }, (_, i) => i + 10);
    const parse = (ids: unknown[]) =>
      parsePersisted(
        STORAGE_KEYS.recentlyViewed,
        JSON.stringify({ accountId: null, ids })
      )?.recentlyViewed?.ids;

    expect(parse([3, 3, 0, -1, 1.5, '7', null, 4])).toEqual([3, 4]);
    expect(parse(many)).toEqual(many.slice(0, BOOK_IDS_MAX));
  });

  it('ignores a stored history of the wrong shape or corrupt JSON', () => {
    for (const raw of [
      'not json',
      JSON.stringify({ accountId: 'x', ids: [1] }),
      JSON.stringify({ accountId: null, ids: 'x' }),
      JSON.stringify([1, 2]),
      'null',
    ]) {
      localStorage.setItem(STORAGE_KEYS.recentlyViewed, raw);
      expect(loadPersistedState().recentlyViewed).toBeUndefined();
    }
  });

  it('writes the history at once, with no throttle', () => {
    const store = createAppStore({});

    store.dispatch(recentlyViewed.record(4));

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.recentlyViewed)!)
    ).toEqual({ accountId: null, ids: [4] });
  });

  it("does not write back another tab's history", () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const store = createAppStore({});

    store.dispatch(recentlyViewed.replaced({ accountId: 3, ids: [9] }));

    expect(
      setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.recentlyViewed)
    ).toHaveLength(0);
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
