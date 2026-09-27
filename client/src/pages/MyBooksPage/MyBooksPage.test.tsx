import { screen, waitFor } from '@testing-library/react';
import { MyBooksPage } from './MyBooksPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const author: PublicUser = {
  id: 3,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderPage = (session: PublicUser | null = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<MyBooksPage />, { queryClient });
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedBooks.listBooks.mockResolvedValue({
    items: [],
    total: 0,
    current: 1,
    pageSize: 100,
  });
});

describe('MyBooksPage', () => {
  it('explains itself to an account that is not an author, and asks for nothing', async () => {
    renderPage({ ...author, role: 'user' });

    expect(
      screen.getByText(
        'Books are kept here for accounts holding the author role.'
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(mockedBooks.listBooks).not.toHaveBeenCalled());
  });

  it('shows the My Books panel to a signed-in author', async () => {
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Create book' })
    ).toBeInTheDocument();
  });
});
