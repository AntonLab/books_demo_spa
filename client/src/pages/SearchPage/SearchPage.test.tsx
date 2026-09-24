import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { useLocation } from 'react-router';
import { SearchPage } from './SearchPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';
import type { PublicBook } from '@/types/book';
import type { PagedResponse } from '@/types/api';
import type { RootState } from '@/store';

jest.mock('@/api/books');
jest.mock('@/api/genres');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);

const book: PublicBook = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: ['epic'],
  status: 'in_progress',
  genre: { id: 4, name: 'Gothic' },
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const pageOf = (
  overrides: Partial<PagedResponse<PublicBook>> = {}
): PagedResponse<PublicBook> => ({
  items: [book],
  total: 1,
  current: 1,
  pageSize: 20,
  ...overrides,
});

// Serves whatever page is asked for, as the server does short of the end, so
// the page never follows a `current` it did not ask for.
const serve = (overrides: Partial<PagedResponse<PublicBook>> = {}) =>
  mockedBooks.listBooks.mockImplementation(async (params = {}) =>
    pageOf({ current: params.current ?? 1, ...overrides })
  );

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

const renderPage = (route: string, preloadedState?: Partial<RootState>) =>
  renderWithProviders(
    <>
      <SearchPage />
      <LocationProbe />
    </>,
    { route, preloadedState }
  );

const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [{ id: 4, name: 'Gothic' }],
  });
  serve();
});

describe('SearchPage', () => {
  it('lists the whole catalogue, most popular first, on a bare /search', async () => {
    renderPage('/search');

    expect(
      screen.getByRole('heading', { name: 'Search results' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 book')).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      sort: 'popular',
      current: 1,
      pageSize: 20,
    });
    expect(mockedGenres.listGenres).toHaveBeenCalledWith({ nonEmpty: true });
  });

  it('fills the form from the URL and combines every field', async () => {
    renderPage(
      '/search?q=dragon&status=complete&author=ann&seriesTitle=ash' +
        '&releasedFrom=2026-01-05&releasedTo=2026-01-10&sort=new&page=1'
    );

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    expect(screen.getByLabelText('Text')).toHaveValue('dragon');
    expect(screen.getByLabelText('Author')).toHaveValue('ann');
    expect(screen.getByLabelText('Released from')).toHaveValue('2026-01-05');
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      author: 'ann',
      seriesTitle: 'ash',
      status: 'complete',
      releasedFrom: dayjs('2026-01-05').startOf('day').toISOString(),
      releasedTo: dayjs('2026-01-10').endOf('day').toISOString(),
      sort: 'new',
      current: 1,
      pageSize: 20,
    });
  });

  it('ignores ?series= and an unknown status or sort', async () => {
    renderPage('/search?series=12&status=draft&sort=oldest');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      sort: 'popular',
      current: 1,
      pageSize: 20,
    });
  });

  it('filters by a genre the list holds', async () => {
    renderPage('/search?genre=4');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ genreId: 4 })
    );
  });

  it.each(['99', 'abc'])(
    'says a genre %s is gone, keeps the other fields and asks for no books',
    async (genre) => {
      renderPage(`/search?genre=${genre}&q=dragon`);

      expect(
        await screen.findByText('This genre no longer exists.')
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Text')).toHaveValue('dragon');
      expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    }
  );

  it('reports a genre list that failed, asking for no books', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    renderPage('/search?genre=4');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('searches on Search, starting again at page 1', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon&page=2');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.type(screen.getByLabelText('Author'), 'ann');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(location()).toBe('/search?q=dragon&author=ann'));
  });

  it('clears everything on Reset', async () => {
    renderPage('/search?q=dragon&sort=new');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(location()).toBe('/search');
  });

  it('turns the page through the URL', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByTitle('2'));

    expect(location()).toBe('/search?q=dragon&page=2');
  });

  it('follows the server to the last non-empty page', async () => {
    mockedBooks.listBooks.mockResolvedValue(pageOf({ current: 1 }));

    renderPage('/search?q=dragon&page=5');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    await waitFor(() => expect(location()).toBe('/search?q=dragon'));
  });

  it('ignores a cached page from the same search without a genre while the genre is blocked', async () => {
    const queryClient = createTestQueryClient();
    // Same search, minus the genre: `genreId: undefined` hashes the same as
    // no `genreId` key at all, so this collides with the blocked search's
    // own query key below.
    queryClient.setQueryData(
      queryKeys.books({
        q: 'dragon',
        sort: 'popular',
        current: 3,
        pageSize: 20,
      }),
      pageOf({ current: 1 })
    );

    renderWithProviders(
      <>
        <SearchPage />
        <LocationProbe />
      </>,
      { route: '/search?q=dragon&genre=99&page=3', queryClient }
    );

    await screen.findByText('This genre no longer exists.');
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(location()).toBe('/search?q=dragon&genre=99&page=3')
    );
  });

  it("shows the server's 400 on the field it names", async () => {
    mockedBooks.listBooks.mockRejectedValue(
      new ApiError(400, 'Request validation failed', [
        { path: ['author'], message: 'Too big' },
      ])
    );

    renderPage('/search?author=ann');

    expect(await screen.findByText('Too big')).toBeInTheDocument();
  });

  it('counts the filters on the closed form', async () => {
    renderPage('/search?q=dragon&status=complete', {
      devicePreferences: {
        theme: 'light',
        resultsLayout: 'grid',
        searchFormExpanded: false,
      },
    });

    expect(await screen.findByText('Filters (2)')).toBeInTheDocument();
  });

  it('shows tiles by default and switches to a list the device keeps', async () => {
    const { store } = renderPage('/search?q=dragon');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    // A tile leaves the description out; the list's card shows it.
    expect(screen.queryByText('A tale of dragons')).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'List' }));

    expect(screen.getByText('A tale of dragons')).toBeInTheDocument();
    expect(store.getState().devicePreferences.resultsLayout).toBe('list');
  });

  it('says so when nothing matches', async () => {
    serve({ items: [], total: 0 });

    renderPage('/search?q=zzz');

    expect(
      await screen.findByText('No books match this search.')
    ).toBeInTheDocument();
    expect(screen.getByText('0 books')).toBeInTheDocument();
  });
});
