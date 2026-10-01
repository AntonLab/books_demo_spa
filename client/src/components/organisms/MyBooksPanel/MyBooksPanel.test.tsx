import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { message } from 'antd';
import { Route, Routes } from 'react-router';
import { MyBooksPanel } from './MyBooksPanel';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicBook } from '@/types/book';
import type { PublicSeries, PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);
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

const book = (
  id: number,
  title: string,
  status: PublicBook['status']
): PublicBook => ({
  id,
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title,
  description: `${title}, described`,
  tags: [],
  status,
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const seriesFixture: PublicSeries = {
  id: 12,
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
    {
      id: 4,
      login: 'cora',
      firstName: 'Cora',
      lastName: 'Writer',
      avatarUrl: null,
    },
  ],
  title: 'The Scale Cycle',
  description: 'Dragons.',
  tags: [],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/my-books" element={<MyBooksPanel authorId={author.id} />} />
    </Routes>,
    { route: '/my-books' }
  );

// The static message API outlives a test's DOM, so a toast would leak into the next test.
afterEach(() => message.destroy());

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
  mockedSeries.listSeries.mockResolvedValue({
    items: [seriesFixture],
    total: 1,
    limit: 100,
    offset: 0,
  });
  mockedBooks.listBooks.mockResolvedValue({
    items: [book(1, 'Private Draft', 'draft'), book(2, 'Out Now', 'complete')],
    total: 2,
    current: 1,
    pageSize: 100,
  });
});

describe('MyBooksPanel', () => {
  it("lists the author's own books, drafts included, with their status", async () => {
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Private Draft' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Out Now' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Naming the caller's own id is what makes the server include drafts.
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      userId: author.id,
      pageSize: 100,
    });
  });

  it('keeps the books under a Books tab', async () => {
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Books' })
    ).toBeInTheDocument();
  });

  it('shows both create buttons on the tab bar, whichever tab is open', async () => {
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Create book' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create series' })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Series' }));

    expect(
      screen.getByRole('button', { name: 'Create book' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Create series' })
    ).toHaveLength(1);
  });

  it('creates a book in a modal and stays on the list', async () => {
    mockedBooks.createBook.mockResolvedValue(book(9, 'New One', 'draft'));
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Create book' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Create book' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'New One');
    await userEvent.type(
      within(dialog).getByLabelText('Description'),
      'Fresh.'
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create book' })
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create book' })).toBeNull()
    );
    expect(mockedBooks.createBook).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Book created.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Books' })).toBeInTheDocument();
  });

  it('creates a series in a modal from the Series tab', async () => {
    mockedSeries.createSeries.mockResolvedValue({ ...seriesFixture, id: 13 });
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Series' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Create series' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Saga');
    await userEvent.type(within(dialog).getByLabelText('Description'), 'Many.');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create series' })
    );

    expect(await screen.findByText('Series created.')).toBeInTheDocument();
    expect(mockedSeries.createSeries).toHaveBeenCalledWith({
      title: 'Saga',
      description: 'Many.',
      tags: [],
      genreId: null,
    });
  });

  it('says so when the author has no books yet', async () => {
    mockedBooks.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 100,
    });
    renderPage();

    expect(
      await screen.findByText('You have not written a book yet.')
    ).toBeInTheDocument();
  });

  it('lists the series the author co-authors under a Series tab', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Series' }));

    expect(
      await screen.findByRole('link', { name: 'The Scale Cycle' })
    ).toHaveAttribute('href', '/series/12/edit');
    expect(screen.getByText('Ann Author, Cora Writer')).toBeInTheDocument();
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      userId: author.id,
      limit: 100,
    });
  });

  it('says so when the author has no series yet', async () => {
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Series' }));

    expect(
      await screen.findByText('You have not started a series yet.')
    ).toBeInTheDocument();
  });
});
