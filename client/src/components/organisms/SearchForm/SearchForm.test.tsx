import { initialReadingPreferences } from '@/store/devicePreferencesSlice';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { useLocation } from 'react-router';
import { SearchFiltersToggle, SearchForm } from './SearchForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import type { PublicBook } from '@/types/book';
import type { PublicSeries } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const author = (id: number, login: string, name: string) => {
  const [firstName = '', lastName = ''] = name.split(' ');
  return { id, login, firstName, lastName, avatarUrl: null };
};

const bookOf = (
  id: number,
  title: string,
  authors: PublicBook['authors'] = []
): PublicBook => ({ id, title, authors }) as Partial<PublicBook> as PublicBook;

const pageOf = (items: PublicBook[]) => ({
  items,
  total: items.length,
  current: 1,
  pageSize: 8,
});

const LocationProbe = () => (
  <div data-testid="location">{useLocation().pathname}</div>
);

beforeEach(() => {
  jest.resetAllMocks();
});

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
    <>
      <SearchForm
        id="filters"
        initialValues={{ sort: 'popular' }}
        genres={genres}
        fieldErrors={[]}
        onSearch={onSearch}
        onReset={onReset}
        {...overrides}
      />
      <LocationProbe />
    </>,
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

  it('asks for no suggestions for the values it starts from', () => {
    renderForm({
      initialValues: {
        q: 'dragon',
        author: 'ann',
        seriesTitle: 'Saga',
        sort: 'popular',
      },
    });

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('suggests the titles holding the typed text, and opens the book picked', async () => {
    mockedBooks.listBooks.mockResolvedValue(
      pageOf([
        bookOf(1, 'A Tale of Dragons'),
        // Found by its description: no title to offer.
        bookOf(2, 'Unrelated'),
      ])
    );
    const { onSearch } = renderForm();

    await userEvent.type(screen.getByLabelText('Text'), ' dr ');
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Text'));
    await userEvent.type(screen.getByLabelText('Text'), 'drag');

    expect(mockedBooks.listBooks).toHaveBeenCalledTimes(2);
    expect(mockedBooks.listBooks).toHaveBeenLastCalledWith({
      q: 'drag',
      pageSize: 8,
    });
    const option = await screen.findByTitle('A Tale of Dragons');
    expect(screen.queryByTitle('Unrelated')).not.toBeInTheDocument();

    await userEvent.click(option);

    expect(screen.getByTestId('location')).toHaveTextContent('/books/1');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('suggests the matching authors once each, searching by the one picked', async () => {
    const ann = author(3, 'annlee', 'Ann Lee');
    const cora = author(4, 'cora', 'Cora Moss');
    mockedBooks.listBooks.mockResolvedValue(
      pageOf([bookOf(1, 'One', [ann, cora]), bookOf(2, 'Two', [ann])])
    );
    const { onSearch } = renderForm();

    await userEvent.type(screen.getByLabelText('Author'), 'lee');

    expect(mockedBooks.listBooks).toHaveBeenLastCalledWith({
      author: 'lee',
      pageSize: 8,
    });
    const options = await screen.findAllByTitle('Ann Lee (annlee)');
    expect(options).toHaveLength(1);
    expect(screen.queryByTitle('Cora Moss (cora)')).not.toBeInTheDocument();

    await userEvent.click(options[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ author: 'annlee', authorId: 3 })
    );

    // Typing after the pick makes it plain text again.
    await userEvent.type(screen.getByLabelText('Author'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ author: 'annleex', authorId: undefined })
    );
  });

  it('keeps the id it starts from until the text is typed over', async () => {
    const { onSearch } = renderForm({
      initialValues: { seriesTitle: 'Saga', seriesId: 2, sort: 'popular' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesTitle: 'Saga', seriesId: 2 })
    );

    await userEvent.type(screen.getByLabelText('Series'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ seriesTitle: 'Saga!', seriesId: undefined })
    );
  });

  it('suggests series titles, spinning while they load, and picks by id', async () => {
    let land: () => void = () => undefined;
    mockedSeries.listSeries.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              items: [{ id: 2, title: 'The Dark Saga' } as PublicSeries],
              total: 1,
              limit: 8,
              offset: 0,
            });
        })
    );
    const { onSearch } = renderForm();

    await userEvent.type(screen.getByLabelText('Series'), 'saga');

    expect(mockedSeries.listSeries).toHaveBeenLastCalledWith({
      q: 'saga',
      limit: 8,
    });
    expect(
      await screen.findByLabelText('Loading suggestions')
    ).toBeInTheDocument();

    act(() => land());

    const option = await screen.findByTitle('The Dark Saga');
    expect(
      screen.queryByLabelText('Loading suggestions')
    ).not.toBeInTheDocument();

    await userEvent.click(option);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ seriesTitle: 'The Dark Saga', seriesId: 2 })
    );
  });

  it('clears a picked author, id and all', async () => {
    const { onSearch } = renderForm({
      initialValues: { author: 'annlee', authorId: 3, sort: 'popular' },
    });
    const authorField = screen.getByLabelText('Author').closest('.ant-select');

    await userEvent.click(authorField!.querySelector('.ant-select-clear')!);

    expect(screen.getByLabelText('Author')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const [values] = onSearch.mock.lastCall as [Record<string, unknown>];
    expect(values.author ?? '').toBe('');
    expect(values.authorId).toBeUndefined();
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

  it('greys out the days on the wrong side of the other end', async () => {
    renderForm({
      initialValues: {
        releasedFrom: dayjs('2026-01-05'),
        // Opens the picker on January.
        releasedTo: dayjs('2026-01-20'),
        sort: 'popular',
      },
    });

    await userEvent.click(screen.getByLabelText('Released to'));

    expect(await screen.findByTitle('2026-01-04')).toHaveClass(
      'ant-picker-cell-disabled'
    );
    expect(screen.getByTitle('2026-01-05')).not.toHaveClass(
      'ant-picker-cell-disabled'
    );
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
