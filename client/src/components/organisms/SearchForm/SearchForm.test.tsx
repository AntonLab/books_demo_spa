import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { SearchForm } from './SearchForm';
import { renderWithProviders } from '@/test/renderWithProviders';

const genres = [
  { id: 4, name: 'Gothic' },
  { id: 5, name: 'Hard SF' },
];

const renderForm = (
  overrides: Partial<Parameters<typeof SearchForm>[0]> = {},
  expanded = true
) => {
  const onSearch = jest.fn();
  const onReset = jest.fn();
  const view = renderWithProviders(
    <SearchForm
      initialValues={{ sort: 'popular' }}
      genres={genres}
      filterCount={0}
      fieldErrors={[]}
      onSearch={onSearch}
      onReset={onReset}
      {...overrides}
    />,
    {
      preloadedState: {
        devicePreferences: {
          theme: 'light',
          resultsLayout: 'grid',
          searchFormExpanded: expanded,
        },
      },
    }
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

  it('counts the filters on its header while closed, and remembers being opened', async () => {
    const { store } = renderForm({ filterCount: 3 }, false);

    await userEvent.click(screen.getByText('Filters (3)'));

    expect(store.getState().devicePreferences.searchFormExpanded).toBe(true);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
});
