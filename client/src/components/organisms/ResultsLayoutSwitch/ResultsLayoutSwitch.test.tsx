import { initialReadingPreferences } from '@/store/devicePreferencesSlice';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsLayoutSwitch } from './ResultsLayoutSwitch';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('ResultsLayoutSwitch', () => {
  it('shows the layout this device chose and switches it', async () => {
    const { store } = renderWithProviders(<ResultsLayoutSwitch />, {
      preloadedState: {
        devicePreferences: {
          theme: 'light',
          resultsLayout: 'list',
          searchFormExpanded: true,
          reading: initialReadingPreferences,
        },
      },
    });

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }));

    expect(store.getState().devicePreferences.resultsLayout).toBe('grid');
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
