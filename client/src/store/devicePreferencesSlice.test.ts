import {
  devicePreferences,
  devicePreferencesReducer,
} from './devicePreferencesSlice';

describe('devicePreferencesSlice', () => {
  it('starts light, with search results in a grid', () => {
    expect(devicePreferencesReducer(undefined, { type: 'init' })).toEqual({
      theme: 'light',
      resultsLayout: 'grid',
    });
  });

  it('toggles between light and dark', () => {
    const dark = devicePreferencesReducer(
      { theme: 'light', resultsLayout: 'grid' },
      devicePreferences.themeToggled()
    );
    expect(dark).toEqual({ theme: 'dark', resultsLayout: 'grid' });

    expect(
      devicePreferencesReducer(dark, devicePreferences.themeToggled())
    ).toEqual({ theme: 'light', resultsLayout: 'grid' });
  });

  it('switches the results layout, keeping the theme', () => {
    expect(
      devicePreferencesReducer(
        { theme: 'dark', resultsLayout: 'grid' },
        devicePreferences.resultsLayoutChanged('list')
      )
    ).toEqual({ theme: 'dark', resultsLayout: 'list' });
  });
});
