import {
  devicePreferences,
  devicePreferencesReducer,
  initialDevicePreferences,
  initialReadingPreferences,
} from './devicePreferencesSlice';

describe('devicePreferencesSlice', () => {
  it('starts light, with search results in a grid, search form open', () => {
    expect(devicePreferencesReducer(undefined, { type: 'init' })).toEqual({
      theme: 'light',
      resultsLayout: 'grid',
      searchFormExpanded: true,
      reading: {
        background: 'auto',
        font: 'sans',
        fontSize: 16,
        lineHeight: 1.6,
        width: 'medium',
        layout: 'scroll',
      },
    });
  });

  it('toggles between light and dark', () => {
    const dark = devicePreferencesReducer(
      initialDevicePreferences,
      devicePreferences.themeToggled()
    );
    expect(dark).toEqual({ ...initialDevicePreferences, theme: 'dark' });

    expect(
      devicePreferencesReducer(dark, devicePreferences.themeToggled())
    ).toEqual(initialDevicePreferences);
  });

  it('switches the results layout, keeping the theme', () => {
    expect(
      devicePreferencesReducer(
        { ...initialDevicePreferences, theme: 'dark' },
        devicePreferences.resultsLayoutChanged('list')
      )
    ).toEqual({
      ...initialDevicePreferences,
      theme: 'dark',
      resultsLayout: 'list',
    });
  });

  it('remembers whether the search form is open, keeping the rest', () => {
    expect(
      devicePreferencesReducer(
        { ...initialDevicePreferences, theme: 'dark', resultsLayout: 'list' },
        devicePreferences.searchFormExpandedChanged(false)
      )
    ).toEqual({
      ...initialDevicePreferences,
      theme: 'dark',
      resultsLayout: 'list',
      searchFormExpanded: false,
    });
  });

  it('changes one reading preference, keeping the others', () => {
    expect(
      devicePreferencesReducer(
        initialDevicePreferences,
        devicePreferences.readingChanged({ font: 'serif' })
      ).reading
    ).toEqual({ ...initialReadingPreferences, font: 'serif' });
  });

  it('switches the reading layout, keeping the other reading preferences', () => {
    expect(
      devicePreferencesReducer(
        initialDevicePreferences,
        devicePreferences.readingChanged({ layout: 'pages' })
      ).reading
    ).toEqual({ ...initialReadingPreferences, layout: 'pages' });
  });

  it('resets the reading preferences alone', () => {
    const changed = {
      ...initialDevicePreferences,
      theme: 'dark' as const,
      reading: {
        background: 'sepia' as const,
        font: 'serif' as const,
        fontSize: 22,
        lineHeight: 2 as const,
        width: 'full' as const,
        layout: 'pages' as const,
      },
    };

    expect(
      devicePreferencesReducer(changed, devicePreferences.readingReset())
    ).toEqual({ ...initialDevicePreferences, theme: 'dark' });
  });
});
