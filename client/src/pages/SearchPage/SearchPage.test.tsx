import { initialReadingPreferences } from '@/store/devicePreferencesSlice';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { SearchPage } from './SearchPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import type { PublicBook } from '@/types/book';
import type { PagedResponse } from 'shared';
import type { RootState } from '@/store';

// What the page shows for each state `useSearchPage` reports; what it reads
// from and writes to the URL is tested in useSearchPage.test.tsx.

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

// Serves whatever page is asked for, as the server does short of the end, so
// the page never follows a `current` it did not ask for.
const serve = (overrides: Partial<PagedResponse<PublicBook>> = {}) =>
  mockedBooks.listBooks.mockImplementation(async (params = {}) => ({
    items: [book],
    total: 1,
    current: params.current ?? 1,
    pageSize: 20,
    ...overrides,
  }));

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
  it('shows the results and their count', async () => {
    renderPage('/search');

    expect(
      screen.getByRole('heading', { name: 'Search results' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 book')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    serve({ items: [], total: 0 });

    renderPage('/search?q=zzz');

    expect(
      await screen.findByText('No books match this search.')
    ).toBeInTheDocument();
    expect(screen.getByText('0 books')).toBeInTheDocument();
  });

  it('turns the page from the pagination', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByTitle('2'));

    expect(location()).toBe('/search?q=dragon&page=2');
  });

  it('shows tiles by default and switches to a list the device keeps', async () => {
    const { store } = renderPage('/search?q=dragon');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    // A tile leaves the description out; the list's card shows it.
    expect(screen.queryByText('A tale of dragons')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByText('A tale of dragons')).toBeInTheDocument();
    expect(store.getState().devicePreferences.resultsLayout).toBe('list');
  });

  it('hides the closed form, counting its filters, and opens it on Filters', async () => {
    renderPage('/search?q=dragon&status=complete', {
      devicePreferences: {
        theme: 'light',
        resultsLayout: 'grid',
        searchFormExpanded: false,
        reading: initialReadingPreferences,
      },
    });

    await screen.findByText('Filters (2)');
    expect(
      screen.queryByRole('button', { name: 'Search' })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters (2)' }));

    expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  it('says a gone genre is gone, keeping the form filled and no layout switch', async () => {
    renderPage('/search?genre=99&q=dragon');

    expect(
      await screen.findByText('This genre no longer exists.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('dragon');
    expect(
      screen.queryByRole('button', { name: 'List' })
    ).not.toBeInTheDocument();
  });

  it('reports a genre list that failed', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    renderPage('/search?genre=4');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
  });
});
