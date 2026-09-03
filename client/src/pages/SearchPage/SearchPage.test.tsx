import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { SearchPage } from './SearchPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import type { PublicBook } from '@/types/book';

jest.mock('@/api/books');

const mockedBooks = jest.mocked(booksApi);

const book: PublicBook = {
  id: 1,
  userId: 3,
  seriesId: null,
  description: 'A tale of dragons',
  tags: ['epic'],
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
