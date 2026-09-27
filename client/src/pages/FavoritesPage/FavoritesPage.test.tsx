import { screen } from '@testing-library/react';
import { FavoritesPage } from './FavoritesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as favoritesApi from '@/api/favorites';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/favorites');
const mockedFavorites = jest.mocked(favoritesApi);

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

  it('shows the Favorites panel once signed in', async () => {
    mockedFavorites.listFavoriteBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Books' })
    ).toBeInTheDocument();
  });
});
