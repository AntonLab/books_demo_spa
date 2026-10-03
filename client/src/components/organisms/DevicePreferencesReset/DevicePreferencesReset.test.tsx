import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevicePreferencesReset } from './DevicePreferencesReset';
import {
  initialDevicePreferences,
  initialReadingPreferences,
} from '@/store/devicePreferencesSlice';
import { renderWithProviders } from '@/test/renderWithProviders';

const renderDark = () =>
  renderWithProviders(<DevicePreferencesReset />, {
    preloadedState: {
      devicePreferences: {
        ...initialDevicePreferences,
        theme: 'dark',
        reading: { ...initialReadingPreferences, fontSize: 20 },
      },
    },
  });

describe('DevicePreferencesReset', () => {
  it('Reset theme sets the theme to light, leaves reading settings, and confirms', async () => {
    const { store } = renderDark();

    await userEvent.click(screen.getByRole('button', { name: 'Reset theme' }));

    const { theme, reading } = store.getState().devicePreferences;
    expect(theme).toBe('light');
    expect(reading.fontSize).toBe(20);
    expect(await screen.findByText('Theme reset.')).toBeInTheDocument();
  });

  it('Reset reading settings restores the reading preferences and leaves the theme', async () => {
    const { store } = renderDark();

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset reading settings' })
    );

    const { theme, reading } = store.getState().devicePreferences;
    expect(reading).toEqual(initialReadingPreferences);
    expect(theme).toBe('dark');
    expect(
      await screen.findByText('Reading settings reset.')
    ).toBeInTheDocument();
  });

  it('says the buttons affect only this device', () => {
    renderDark();

    expect(
      screen.getByText('These affect only this device.')
    ).toBeInTheDocument();
  });
});
