import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { PublicWorksList } from './PublicWorksList';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import type { PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';

jest.mock('@/api/books');
jest.mock('@/api/series');
const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};
const book = (id: number, title: string) =>
  ({
    id,
    title,
    status: 'complete',
    authors: [ann],
    description: 'D.',
    tags: [],
    genre: null,
    coverUrl: null,
    seriesId: null,
    series: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }) as PublicBook;
const series = (id: number, title: string) =>
  ({
    id,
    title,
    coverUrl: null,
    bookCount: 1,
    authors: [ann],
    description: 'D.',
    tags: [],
    genre: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }) as PublicSeries;

const Probe = () => <div data-testid="search">{useLocation().search}</div>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('PublicWorksList', () => {
  it('lists the Books of the Account as read-only cards, Popular first', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book(1, 'Alpha')],
      total: 1,
      current: 1,
      pageSize: 20,
    });
    renderWithProviders(<PublicWorksList kind="books" userId={7} />, {
      route: '/accounts/7',
    });

    expect(
      await screen.findByRole('link', { name: 'Alpha' })
    ).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      userId: 7,
      published: 'true',
      sort: 'popular',
      current: 1,
      pageSize: 20,
    });
    expect(
      screen.queryByRole('button', { name: /edit|delete|remove|publish/i })
    ).toBeNull();
  });

  it('asks the Series route with limit and offset, and links each card to its page', async () => {
    mockedSeries.listSeries.mockResolvedValue({
      items: [series(4, 'Saga')],
      total: 45,
      limit: 20,
      offset: 20,
    });
    renderWithProviders(<PublicWorksList kind="series" userId={7} />, {
      route: '/accounts/7?page=2',
    });

    expect(await screen.findByRole('link', { name: 'Saga' })).toHaveAttribute(
      'href',
      '/series/4'
    );
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      userId: 7,
      published: 'true',
      sort: 'popular',
      limit: 20,
      offset: 20,
    });
  });

  it('keeps the sort in the query string and returns to page 1 on a new sort', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book(1, 'Alpha')],
      total: 45,
      current: 1,
      pageSize: 20,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PublicWorksList kind="books" userId={7} />
        <Probe />
      </>,
      { route: '/accounts/7?page=2' }
    );

    await user.click(await screen.findByText('New releases'));

    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?sort=new')
    );
    expect(mockedBooks.listBooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'new', current: 1 })
    );
  });

  it('pages through the query string, and clamps a page past the end', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [book(1, 'Alpha')],
      total: 45,
      current: 9,
      pageSize: 20,
    });
    renderWithProviders(
      <>
        <PublicWorksList kind="books" userId={7} />
        <Probe />
      </>,
      { route: '/accounts/7?page=9' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?page=3')
    );
  });
});
