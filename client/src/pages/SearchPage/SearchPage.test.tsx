import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { SearchPage } from './SearchPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';
import type { PublicBook } from '@/types/book';
import type { PublicSeries } from '@/types/series';

jest.mock('@/api/books');
jest.mock('@/api/series');
jest.mock('@/api/genres');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);
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

beforeEach(() => {
  jest.resetAllMocks();
});

describe('SearchPage', () => {
  it('prompts for a term when the URL carries no q', () => {
    renderWithProviders(<SearchPage />, { route: '/search' });

    expect(
      screen.getByText('Enter a search term to find books.')
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('searches for the term in the URL', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?q=dragon' });

    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      limit: 20,
    });
  });

  it('shows the result count and echoes the term', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?q=dragon' });

    expect(
      await screen.findByRole('heading', { name: '1 result for "dragon"' })
    ).toBeInTheDocument();
  });

  it('pluralises the result count', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book, { ...book, id: 2 }],
      total: 2,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?q=dragon' });

    expect(
      await screen.findByRole('heading', { name: '2 results for "dragon"' })
    ).toBeInTheDocument();
  });

  it('shows an empty state naming the term when nothing matches', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?q=griffin' });

    expect(
      await screen.findByText('No books match "griffin".')
    ).toBeInTheDocument();
  });

  it('shows the error state when the search fails', async () => {
    mockedBooks.listBooks.mockRejectedValue(new Error('Network down'));

    renderWithProviders(<SearchPage />, { route: '/search?q=dragon' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  });

  it('does not claim a search is still running once it has failed', async () => {
    mockedBooks.listBooks.mockRejectedValue(new Error('Network down'));

    renderWithProviders(<SearchPage />, { route: '/search?q=dragon' });

    // The heading used to fall through to "Searching for ..." on the error
    // path too, telling the user a failed search was still in flight.
    expect(
      await screen.findByRole('heading', { name: 'Search failed for "dragon"' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Searching for "dragon"' })
    ).toBeNull();
  });

  it('trims the term from the URL before searching', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?q=%20dragon%20' });

    expect(
      await screen.findByText('No books match "dragon".')
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      limit: 20,
    });
  });

  it('refetches when ?q= changes on an already-mounted page', async () => {
    const elfBook: PublicBook = {
      ...book,
      id: 2,
      description: 'An elf journey',
    };
    mockedBooks.listBooks
      .mockResolvedValueOnce({ items: [book], total: 1, limit: 20, offset: 0 })
      .mockResolvedValueOnce({
        items: [elfBook],
        total: 1,
        limit: 20,
        offset: 0,
      });

    // A stand-in for the header's SearchBar navigating while SearchPage stays
    // mounted, the way it does in the real app: a fresh visit, a reload, a
    // pasted link and a back/forward press should all funnel through this
    // same ?q=-driven effect rather than a component-state one.
    const Harness = () => {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => void navigate('/search?q=elf')}>
            go to elf
          </button>
          <SearchPage />
        </>
      );
    };

    renderWithProviders(<Harness />, { route: '/search?q=dragon' });

    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'go to elf' }));

    expect(await screen.findByText('An elf journey')).toBeInTheDocument();
    expect(screen.queryByText('A tale of dragons')).toBeNull();
    expect(mockedBooks.listBooks).toHaveBeenCalledTimes(2);
    expect(mockedBooks.listBooks).toHaveBeenNthCalledWith(1, {
      q: 'dragon',
      limit: 20,
    });
    expect(mockedBooks.listBooks).toHaveBeenNthCalledWith(2, {
      q: 'elf',
      limit: 20,
    });
  });
});

describe('SearchPage for one series', () => {
  const series: PublicSeries = {
    id: 12,
    authors: book.authors,
    title: 'The Ashgrove Chronicles',
    description: 'Letters found in a manor that should have stayed shut.',
    tags: ['gothic'],
    genre: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('heads the page with the series and lists its books', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?series=12' });

    expect(
      await screen.findByRole('heading', { name: 'The Ashgrove Chronicles' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Letters found in a manor that should have stayed shut.')
    ).toBeInTheDocument();
    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();
    expect(mockedSeries.getSeries).toHaveBeenCalledWith(12);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      seriesId: 12,
      limit: 20,
    });
  });

  it('says so when none of its books is out yet', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?series=12' });

    expect(
      await screen.findByText('No book in this series has been published yet.')
    ).toBeInTheDocument();
  });

  it('says so when the series no longer exists', async () => {
    mockedSeries.getSeries.mockRejectedValue(
      new ApiError(404, 'Series not found')
    );
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?series=99' });

    expect(
      await screen.findByText('This series no longer exists.')
    ).toBeInTheDocument();
  });

  it('reports any other failure to load the series', async () => {
    mockedSeries.getSeries.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?series=12' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this series.'
    );
  });

  it('asks the server nothing for an id that is not one', () => {
    renderWithProviders(<SearchPage />, { route: '/search?series=abc' });

    expect(
      screen.getByText('This series no longer exists.')
    ).toBeInTheDocument();
    expect(mockedSeries.getSeries).not.toHaveBeenCalled();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });
});

describe('SearchPage for one genre', () => {
  const gothicSeries: PublicSeries = {
    id: 12,
    authors: book.authors,
    title: 'The Ashgrove Chronicles',
    description: 'Letters found in a manor that should have stayed shut.',
    tags: ['gothic'],
    genre: { id: 4, name: 'Gothic' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  const withGenres = () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [
        { id: 4, name: 'Gothic' },
        { id: 5, name: 'Hard SF' },
      ],
    });
  };

  it('heads the page with the genre and lists its books', async () => {
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Gothic' })
    ).toBeInTheDocument();
    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      genreId: 4,
      limit: 20,
    });
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      genreId: 4,
      limit: 20,
    });
  });

  it('lists the genre’s series under a Series heading, each one linked', async () => {
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [gothicSeries],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Series' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'The Ashgrove Chronicles' })
    ).toHaveAttribute('href', '/search?series=12');
  });

  it('leaves the Series block out when the genre holds none', async () => {
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    await screen.findByText('A tale of dragons');
    expect(screen.queryByRole('heading', { name: 'Series' })).toBeNull();
  });

  it('reports a failure to load the series without hiding the books', async () => {
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockRejectedValue(new Error('Network down'));

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the series in this genre.'
    );
    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();
  });

  it('says so when the genre holds no books yet', async () => {
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    expect(
      await screen.findByText('No books in this genre yet.')
    ).toBeInTheDocument();
  });

  it('says the genre is gone when the list does not hold it, and asks for nothing', async () => {
    withGenres();

    renderWithProviders(<SearchPage />, { route: '/search?genre=99' });

    expect(
      await screen.findByText('This genre no longer exists.')
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('asks the server nothing for an id that is not one', () => {
    renderWithProviders(<SearchPage />, { route: '/search?genre=abc' });

    expect(
      screen.getByText('This genre no longer exists.')
    ).toBeInTheDocument();
    expect(mockedGenres.listGenres).not.toHaveBeenCalled();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('reports a failure to load the genre list', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    renderWithProviders(<SearchPage />, { route: '/search?genre=4' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
  });

  it('lets series win over genre, and genre over a term', async () => {
    withGenres();
    mockedSeries.getSeries.mockResolvedValue(gothicSeries);
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const { unmount } = renderWithProviders(<SearchPage />, {
      route: '/search?series=12&genre=4&q=dragon',
    });

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'The Ashgrove Chronicles',
      })
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      seriesId: 12,
      limit: 20,
    });

    unmount();
    jest.clearAllMocks();
    withGenres();
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<SearchPage />, { route: '/search?genre=4&q=dragon' });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Gothic' })
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      genreId: 4,
      limit: 20,
    });
  });
});
