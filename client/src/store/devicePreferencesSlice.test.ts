import {
  devicePreferences,
  devicePreferencesReducer,
} from './devicePreferencesSlice';

describe('devicePreferencesSlice', () => {
  it('starts light', () => {
    expect(devicePreferencesReducer(undefined, { type: 'init' })).toEqual({
      theme: 'light',
    });
  });

  it('toggles between light and dark', () => {
    const dark = devicePreferencesReducer(
      { theme: 'light' },
      devicePreferences.themeToggled()
    );
    expect(dark).toEqual({ theme: 'dark' });

    expect(
      devicePreferencesReducer(dark, devicePreferences.themeToggled())
    ).toEqual({ theme: 'light' });
  });
});
