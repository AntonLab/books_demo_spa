import { initialReadingPreferences } from '@/store/devicePreferencesSlice';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { SearchFiltersToggle, SearchForm } from './SearchForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const genres = [
  { id: 4, name: 'Gothic' },
  { id: 5, name: 'Hard SF' },
];

const preferences = (expanded: boolean) => ({
  devicePreferences: {
    theme: 'light' as const,
    resultsLayout: 'grid' as const,
    searchFormExpanded: expanded,
    reading: initialReadingPreferences,
  },
});

const renderForm = (
  overrides: Partial<Parameters<typeof SearchForm>[0]> = {}
) => {
  const onSearch = jest.fn();
  const onReset = jest.fn();
  const view = renderWithProviders(
    <SearchForm
      id="filters"
      initialValues={{ sort: 'popular' }}
      genres={genres}
      fieldErrors={[]}
      onSearch={onSearch}
      onReset={onReset}
      {...overrides}
    />,
    { preloadedState: preferences(true) }
  );
  return { ...view, onSearch, onReset };
};

describe('SearchForm', () => {
  it('shows the values it starts from and searches with what is typed', async () => {
    const { onSearch } = renderForm({
      initialValues: {
        q: 'dragon',
        releasedFrom: dayjs('2026-01-05'),
        sort: 'new',
      },
    });

    expect(screen.getByLabelText('Text')).toHaveValue('dragon');
    expect(screen.getByLabelText('Released from')).toHaveValue('2026-01-05');

    await userEvent.type(screen.getByLabelText('Author'), 'ann');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'dragon', author: 'ann', sort: 'new' })
    );
  });

  it('offers the genres it is given', async () => {
    const { onSearch } = renderForm();

    await userEvent.click(screen.getByRole('combobox', { name: 'Genre' }));
    await userEvent.click(await screen.findByTitle('Hard SF'));
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ genre: 5 })
    );
  });

  it('resets through its caller', async () => {
    const { onReset } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('does not search while a range starts after it ends', async () => {
    const { onSearch } = renderForm({
      initialValues: {
        updatedFrom: dayjs('2026-02-01'),
        updatedTo: dayjs('2026-01-01'),
        sort: 'popular',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByText('Must not be after the end date.')
    ).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('does not search with an over-long text', async () => {
    const { onSearch } = renderForm({
      initialValues: { seriesTitle: 'a'.repeat(201), sort: 'popular' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByText('At most 200 characters.')
    ).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("shows the server's errors on their fields", async () => {
    renderForm({ fieldErrors: [{ name: 'author', errors: ['Too big'] }] });

    expect(await screen.findByText('Too big')).toBeInTheDocument();
  });
});

describe('SearchFiltersToggle', () => {
  it('counts the filters while closed, and remembers being opened and closed', async () => {
    const { store } = renderWithProviders(
      <SearchFiltersToggle controls="filters" filterCount={3} />,
      { preloadedState: preferences(false) }
    );

    const toggle = screen.getByRole('button', { name: 'Filters (3)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'filters');

    await userEvent.click(toggle);

    expect(store.getState().devicePreferences.searchFormExpanded).toBe(true);
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));

    expect(store.getState().devicePreferences.searchFormExpanded).toBe(false);
  });
});
