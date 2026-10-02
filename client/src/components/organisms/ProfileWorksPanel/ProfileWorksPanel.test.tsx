import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { ProfileWorksPanel } from './ProfileWorksPanel';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { BookDetail, PublicBook } from '@/types/book';
import type { PublicSeries, PublicUser, SeriesDetail } from '@/types/api';
import type { ProfileScope } from '@/types/profileScope';

jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');
const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);
const mockedSeries = jest.mocked(seriesApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};
const author = {
  ...ann,
  email: 'ann@example.com',
  status: 'active',
  role: 'author',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PublicUser;
const dates = {
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
const book = {
  id: 2,
  title: 'Out Now',
  status: 'complete',
  authors: [ann],
  description: 'D.',
  tags: [],
  genre: null,
  coverUrl: null,
  seriesId: null,
  ...dates,
} as PublicBook;
const series = {
  id: 12,
  title: 'The Scale Cycle',
  authors: [ann],
  description: 'Dragons.',
  tags: [],
  genre: null,
  ...dates,
} as PublicSeries;
const bookDetail = {
  ...book,
  series: null,
  likeCount: 0,
  commentCount: 0,
  wordCount: 0,
  favoriteCount: 0,
  viewerFavoriteId: null,
  viewerLikeId: null,
} as BookDetail;
const seriesDetail = {
  ...series,
  favoriteCount: 0,
  viewerFavoriteId: null,
} as SeriesDetail;
const booksPage = (items: PublicBook[]) => ({
  items,
  total: items.length,
  current: 1,
  pageSize: 20,
});
const seriesPage = (items: PublicSeries[]) => ({
  items,
  total: items.length,
  limit: 20,
  offset: 0,
});

const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const renderPanel = (scope: ProfileScope, route = '/p') => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, author);
  return renderWithProviders(
    <>
      <ProfileWorksPanel scope={scope} viewerId={3} />
      <Probe />
    </>,
    { queryClient, route }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
  mockedBooks.listBooks.mockResolvedValue(booksPage([book]));
  mockedBooks.listFavoritedBooks.mockResolvedValue({
    items: [],
    total: 0,
    current: 1,
    pageSize: 20,
  });
  mockedSeries.listSeries.mockResolvedValue(seriesPage([series]));
  mockedSeries.listFavoritedSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
});

describe('ProfileWorksPanel inner tabs', () => {
  it('opens Books by default and Series for tab=series, fetching only the open one', async () => {
    renderPanel('mine', '/p?tab=series');

    expect(
      await screen.findByRole('link', { name: 'The Scale Cycle' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Series' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });

  it('opens Books for a tab value it does not know', async () => {
    renderPanel('mine', '/p?tab=bogus');

    expect(
      await screen.findByRole('link', { name: 'Out Now' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Books' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switching the tab drops every filter, the page and the size', async () => {
    renderPanel('mine', '/p?q=x&sort=new&page=2&pageSize=50');

    await userEvent.click(await screen.findByRole('tab', { name: 'Series' }));
    expect(screen.getByTestId('search')).toHaveTextContent(/^\?tab=series$/);
    await userEvent.click(screen.getByRole('tab', { name: 'Books' }));
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
  });
});

// The clicked icon's tooltip stays in the DOM in jsdom, and under the test id
// stub it shares its id with the modal title, so the dialog loses its
// accessible name. The only dialog is found by role and its title read as text.
describe('ProfileWorksPanel edit modals', () => {
  it('opens the book edit-details modal from a row and saves in place', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.updateBook.mockResolvedValue(bookDetail);
    renderPanel('mine');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit Out Now' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit book details')).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Title')).toHaveValue(
      'Out Now'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Book saved.')).toBeInTheDocument();
  });

  it('opens the series edit-details modal from a row', async () => {
    mockedSeries.getSeries.mockResolvedValue(seriesDetail);
    renderPanel('mine', '/p?tab=series');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit The Scale Cycle' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit series details')).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Title')).toHaveValue(
      'The Scale Cycle'
    );
  });
});
