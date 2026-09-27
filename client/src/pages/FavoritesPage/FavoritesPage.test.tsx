import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoritesPage } from './FavoritesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as favoritesApi from '@/api/favorites';
import type { PublicBook } from '@/types/book';
import type {
  FavoriteBook,
  FavoriteSeries,
  PublicSeries,
  PublicUser,
} from '@/types/api';

jest.mock('@/api/favorites');
const mockedFavorites = jest.mocked(favoritesApi);

const ann = {
  id: 3,
  login: 'Author',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};

const reader: PublicUser = {
  id: 9,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const book = (id: number, title: string): PublicBook => ({
  id,
  authors: [ann],
  seriesId: null,
  title,
  description: '',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const series: PublicSeries = {
  id: 12,
  authors: [ann],
  title: 'The Ashgrove Chronicles',
  description: '',
  tags: [],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// The Favorite's own id differs from the work's on purpose: Remove must
// send the former.
const favoriteBook = (id: number, work: PublicBook): FavoriteBook => ({
  id,
  createdAt: '2026-09-26T10:00:00.000Z',
  book: work,
});

const page = <Item,>(items: Item[], total = items.length, offset = 0) => ({
  items,
  total,
  limit: 20,
  offset,
});

const renderPage = (session: PublicUser | null = reader) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<FavoritesPage />, {
    route: '/favorites',
    queryClient,
  });
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('FavoritesPage', () => {
  it('asks a Guest to log in and fetches nothing', () => {
    renderPage(null);

    expect(
      screen.getByRole('heading', { name: 'Favorites' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Log in to see your favorites.')
    ).toBeInTheDocument();
    expect(mockedFavorites.listFavoriteBooks).not.toHaveBeenCalled();
  });

  it('lists the favorite books on the first page, each with its authors', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue(
      page([favoriteBook(50, book(1, 'A Tale of Dragons'))])
    );

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toHaveAttribute('href', '/books/1');
    expect(screen.getByText('Ann Author')).toBeInTheDocument();
    expect(mockedFavorites.listFavoriteBooks).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
    // Not fetched until its tab opens.
    expect(mockedFavorites.listFavoriteSeries).not.toHaveBeenCalled();
  });

  it('says so when no book is a Favorite yet', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue(page([]));

    renderPage();

    expect(
      await screen.findByText('No book is in your favorites yet.')
    ).toBeInTheDocument();
  });

  it('reports a list that will not load', async () => {
    mockedFavorites.listFavoriteBooks.mockRejectedValue(
      new ApiError(500, 'boom')
    );

    renderPage();

    expect(
      await screen.findByText('Could not load your favorite books.')
    ).toBeInTheDocument();
  });

  it('lists the favorite series under the Series tab', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue(page([]));
    const favoriteSeries: FavoriteSeries = {
      id: 60,
      createdAt: '2026-09-26T10:00:00.000Z',
      series,
    };
    mockedFavorites.listFavoriteSeries.mockResolvedValue(
      page([favoriteSeries])
    );

    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Series' }));

    expect(
      await screen.findByRole('link', { name: 'The Ashgrove Chronicles' })
    ).toHaveAttribute('href', '/series/12');
  });

  it('removes a Favorite by its own id and refetches the list', async () => {
    mockedFavorites.listFavoriteBooks
      .mockResolvedValueOnce(
        page([favoriteBook(50, book(1, 'A Tale of Dragons'))])
      )
      .mockResolvedValue(page([]));
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);

    renderPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Remove A Tale of Dragons from favorites',
      })
    );

    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(50);
    expect(
      await screen.findByText('No book is in your favorites yet.')
    ).toBeInTheDocument();
  });

  it('turns the page from the pager', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue(
      page([favoriteBook(50, book(1, 'A Tale of Dragons'))], 41)
    );

    renderPage();
    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    await userEvent.click(screen.getByTitle('3'));

    await waitFor(() =>
      expect(mockedFavorites.listFavoriteBooks).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 40,
      })
    );
  });

  it('steps back a page when the last row of the last page is removed', async () => {
    const lonely = favoriteBook(90, book(41, 'The Last One'));
    const secondPage = page(
      [favoriteBook(70, book(21, 'Twenty-first'))],
      40,
      20
    );
    mockedFavorites.listFavoriteBooks.mockImplementation(({ offset }) => {
      if (offset === 40) {
        // Before the removal: 41 Favorites, one on page 3. After it: none.
        return Promise.resolve(
          mockedFavorites.deleteFavorite.mock.calls.length === 0
            ? page([lonely], 41, 40)
            : page([], 40, 40)
        );
      }
      // Page 1 needs a row: an empty list shows no pager to click.
      return Promise.resolve(
        offset === 20
          ? secondPage
          : page([favoriteBook(60, book(2, 'The First One'))], 41)
      );
    });
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('link', { name: 'The First One' });
    await userEvent.click(screen.getByTitle('3'));
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Remove The Last One from favorites',
      })
    );

    expect(
      await screen.findByRole('link', { name: 'Twenty-first' })
    ).toBeInTheDocument();
    expect(screen.queryByText('No book is in your favorites yet.')).toBeNull();
  });
});
