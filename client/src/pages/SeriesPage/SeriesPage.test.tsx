import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { SeriesPage } from './SeriesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import { ApiError } from '@/api/client';
import type { PublicBook } from '@/types/book';
import type { PublicSeries } from '@/types/series';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const coAuthor = {
  id: 3,
  login: 'Author',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};

const series: PublicSeries = {
  id: 12,
  authors: [coAuthor],
  title: 'The Ashgrove Chronicles',
  description: 'Letters found in a manor that should have stayed shut.',
  tags: ['gothic'],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const book: PublicBook = {
  id: 1,
  authors: [coAuthor],
  seriesId: 12,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const account = (overrides: Partial<PublicUser> = {}): PublicUser => ({
  ...coAuthor,
  email: 'ann@example.com',
  status: 'active',
  role: 'author',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = (
  route = '/series/12',
  session: PublicUser | null = null
) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <Routes>
      <Route path="/series/:id" element={<SeriesPage />} />
      <Route path="/series/:id/edit" element={<p>Series editor</p>} />
    </Routes>,
    { route, queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('SeriesPage', () => {
  it('heads the page with the series and lists its books in Series order', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      current: 1,
      pageSize: 100,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'The Ashgrove Chronicles' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(mockedSeries.getSeries).toHaveBeenCalledWith(12);
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      seriesId: 12,
      pageSize: 100,
    });
    expect(
      screen.getByRole('radiogroup', { name: 'Results layout' })
    ).toBeInTheDocument();
  });

  it('says so when none of its books is out yet', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 100,
    });

    renderPage();

    expect(
      await screen.findByText('No book in this series has been published yet.')
    ).toBeInTheDocument();
  });

  it('says the series is gone on a 404 and asks for no books', async () => {
    mockedSeries.getSeries.mockRejectedValue(
      new ApiError(404, 'Series not found')
    );

    renderPage('/series/99');

    expect(
      await screen.findByText('This series no longer exists.')
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('reports any other failure to load the series', async () => {
    mockedSeries.getSeries.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this series.'
    );
  });

  it('asks the server nothing for an id that is not one', () => {
    renderPage('/series/abc');

    expect(
      screen.getByText('This series no longer exists.')
    ).toBeInTheDocument();
    expect(mockedSeries.getSeries).not.toHaveBeenCalled();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('offers a co-author the editor', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 100,
    });

    renderPage('/series/12', account());

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit series' })
    );
    expect(await screen.findByText('Series editor')).toBeInTheDocument();
  });

  it('offers a moderator the editor too, and nobody else', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 100,
    });

    const { unmount } = renderPage(
      '/series/12',
      account({ id: 50, role: 'admin' })
    );
    expect(
      await screen.findByRole('button', { name: 'Edit series' })
    ).toBeInTheDocument();
    unmount();

    renderPage('/series/12', account({ id: 51, role: 'author' }));
    await screen.findByRole('heading', { name: 'The Ashgrove Chronicles' });
    expect(screen.queryByRole('button', { name: 'Edit series' })).toBeNull();
  });
});
