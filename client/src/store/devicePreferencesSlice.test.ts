import {
  devicePreferences,
  devicePreferencesReducer,
} from './devicePreferencesSlice';

describe('devicePreferencesSlice', () => {
  it('starts light, with search results in a grid, search form open', () => {
    expect(devicePreferencesReducer(undefined, { type: 'init' })).toEqual({
      theme: 'light',
      resultsLayout: 'grid',
      searchFormExpanded: true,
    });
  });

  it('toggles between light and dark', () => {
    const dark = devicePreferencesReducer(
      { theme: 'light', resultsLayout: 'grid', searchFormExpanded: true },
      devicePreferences.themeToggled()
    );
    expect(dark).toEqual({
      theme: 'dark',
      resultsLayout: 'grid',
      searchFormExpanded: true,
    });

    expect(
      devicePreferencesReducer(dark, devicePreferences.themeToggled())
    ).toEqual({
      theme: 'light',
      resultsLayout: 'grid',
      searchFormExpanded: true,
    });
  });

  it('switches the results layout, keeping the theme', () => {
    expect(
      devicePreferencesReducer(
        { theme: 'dark', resultsLayout: 'grid', searchFormExpanded: true },
        devicePreferences.resultsLayoutChanged('list')
      )
    ).toEqual({
      theme: 'dark',
      resultsLayout: 'list',
      searchFormExpanded: true,
    });
  });

  it('remembers whether the search form is open, keeping the rest', () => {
    expect(
      devicePreferencesReducer(
        { theme: 'dark', resultsLayout: 'list', searchFormExpanded: true },
        devicePreferences.searchFormExpandedChanged(false)
      )
    ).toEqual({
      theme: 'dark',
      resultsLayout: 'list',
      searchFormExpanded: false,
    });
  });
});
