import { createAppStore } from './index';
import { devicePreferences } from './devicePreferencesSlice';
import { STORAGE_KEYS, loadPersistedState } from './persistence';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
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
});
