import { screen } from '@testing-library/react';
import { MainPage } from './MainPage';
import { renderWithProviders } from '../test/renderWithProviders';
import * as booksApi from '../api/books';
import type { PublicBook } from '../types/book';

jest.mock('../api/books');

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

describe('MainPage', () => {
  it('fetches the first page of books on mount', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<MainPage />);

    expect(await screen.findByText('A tale of dragons')).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({ limit: 20 });
  });

  it('shows the error state when the fetch fails', async () => {
    mockedBooks.listBooks.mockRejectedValue(new Error('Network down'));

    renderWithProviders(<MainPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  });

  it('shows the empty state when there are no books', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<MainPage />);

    expect(await screen.findByText('No books yet.')).toBeInTheDocument();
  });
});
