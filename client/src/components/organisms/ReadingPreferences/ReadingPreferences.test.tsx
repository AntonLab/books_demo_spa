import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingPreferences } from './ReadingPreferences';
import {
  initialDevicePreferences,
  initialReadingPreferences,
} from '@/store/devicePreferencesSlice';
import { renderWithProviders } from '@/test/renderWithProviders';

const renderWith = (reading = initialReadingPreferences) =>
  renderWithProviders(<ReadingPreferences />, {
    preloadedState: {
      devicePreferences: { ...initialDevicePreferences, reading },
    },
  });

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Reading preferences' }));

describe('ReadingPreferences', () => {
  it('opens its form from the gear button', async () => {
    renderWith();

    await open();

    expect(screen.getByText('Background')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('stores each choice as a Device preference', async () => {
    const { store } = renderWith();
    await open();

    await userEvent.click(screen.getByText('Sepia'));
    await userEvent.click(screen.getByText('Serif'));
    await userEvent.click(screen.getByText('Wide'));
    await userEvent.click(screen.getByText('2'));
    await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));

    expect(store.getState().devicePreferences.reading).toEqual({
      background: 'sepia',
      font: 'serif',
      fontSize: 18,
      lineHeight: 2,
      width: 'wide',
    });
  });

  it('stops the font size at either end', async () => {
    renderWith({ ...initialReadingPreferences, fontSize: 14 });
    await open();

    expect(screen.getByRole('button', { name: 'Smaller text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeEnabled();
  });

  it('stops growing at the largest size', async () => {
    renderWith({ ...initialReadingPreferences, fontSize: 28 });
    await open();

    expect(screen.getByRole('button', { name: 'Larger text' })).toBeDisabled();
  });

  it('resets every reading preference', async () => {
    const { store } = renderWith({
      background: 'black',
      font: 'serif',
      fontSize: 24,
      lineHeight: 1.4,
      width: 'full',
    });
    await open();

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(store.getState().devicePreferences.reading).toEqual(
      initialReadingPreferences
    );
  });
});
