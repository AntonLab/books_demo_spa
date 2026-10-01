import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { message } from 'antd';
import { BookEditDetailsModal } from './BookEditDetailsModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { BookDetail } from '@/types/book';
import type { PublicUser } from '@/types/api';

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

const bookDetail: BookDetail = {
  id: 1,
  authors: [ann],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'Long ago, in a kingdom of scales.',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: null,
  likeCount: 0,
  commentCount: 0,
  wordCount: 0,
  favoriteCount: 0,
  viewerFavoriteId: null,
  viewerLikeId: null,
};

const author: PublicUser = {
  id: ann.id,
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

const onClose = jest.fn();

const renderModal = (session: PublicUser = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <BookEditDetailsModal bookId={1} onClose={onClose} />,
    { queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedGenres.listGenres.mockResolvedValue({
    items: [{ id: 4, name: 'Gothic' }],
  });
});

// The static message API outlives a test's DOM, so a toast would leak into the next test. Wrapped in act because destroy updates mounted toast state.
afterEach(() => act(() => message.destroy()));

describe('BookEditDetailsModal', () => {
  it('loads the book into the form and saves it, then closes and announces it', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.updateBook.mockResolvedValue(bookDetail);
    renderModal();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('A Tale of Dragons');
    await userEvent.clear(title);
    await userEvent.type(title, 'A Tale of Wyrms');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedBooks.updateBook).toHaveBeenCalledWith(1, {
      title: 'A Tale of Wyrms',
      description: 'Long ago, in a kingdom of scales.',
      tags: [],
      seriesId: null,
      genreId: null,
      status: 'in_progress',
    });
    expect(await screen.findByText('Book saved.')).toBeInTheDocument();
  });

  it('saves a changed status', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.updateBook.mockResolvedValue(bookDetail);
    renderModal();

    await screen.findByLabelText('Title');
    await userEvent.click(screen.getByText('Complete'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedBooks.updateBook).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'complete' })
    );
  });

  it('keeps an existing genre on an unrelated save', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...bookDetail,
      genre: { id: 4, name: 'Gothic' },
    });
    mockedBooks.updateBook.mockResolvedValue(bookDetail);
    renderModal();

    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'A Tale of Wyrms');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedBooks.updateBook).toHaveBeenCalled());
    expect(mockedBooks.updateBook).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ genreId: 4 })
    );
  });

  it('offers the book’s own series though the viewer does not co-author it', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...bookDetail,
      seriesId: 12,
      series: { id: 12, title: 'The Scale Cycle' },
    });
    mockedBooks.updateBook.mockResolvedValue(bookDetail);
    renderModal();

    const title = await screen.findByLabelText('Title');
    expect(screen.getByText('The Scale Cycle')).toBeInTheDocument();
    await userEvent.type(title, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedBooks.updateBook).toHaveBeenCalled());
    expect(mockedBooks.updateBook).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ seriesId: 12 })
    );
  });

  it('keeps the modal, the message and the typed text when the server refuses', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.updateBook.mockRejectedValue(new Error('Title is taken'));
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('A Tale of Dragons!');
    expect(screen.queryByText('Book saved.')).toBeNull();
  });

  it('asks before discarding an edit', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // jsdom renders the antd confirm title twice.
    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes at once, with no warning, while the book is still loading', async () => {
    mockedBooks.getBook.mockReturnValue(new Promise(() => {}));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Only the unconnected-form warning matters: jsdom logs its own noise when
    // any antd modal opens.
    expect(
      spy.mock.calls.some(([first]) => String(first).includes('not connected'))
    ).toBe(false);
    spy.mockRestore();
  });

  it('shows an error when the book cannot be loaded', async () => {
    mockedBooks.getBook.mockRejectedValue(new Error('boom'));
    renderModal();

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
  });

  it('refuses an account that may not edit the book', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    renderModal({ ...author, id: 99 });

    expect(
      await screen.findByText('Only its co-authors can edit this book.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });
});
