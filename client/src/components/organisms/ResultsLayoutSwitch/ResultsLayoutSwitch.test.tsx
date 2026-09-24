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
        },
      },
    });

    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Grid' }));

    expect(store.getState().devicePreferences.resultsLayout).toBe('grid');
  });
});
