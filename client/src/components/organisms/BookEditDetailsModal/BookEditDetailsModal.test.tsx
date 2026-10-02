import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookEditDetailsModal } from './BookEditDetailsModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { genreItem, publicGenre } from '@/test/genres';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { BookDetail } from '@/types/book';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/authors');
jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
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
const onGone = jest.fn();

const renderModal = (session: PublicUser = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <BookEditDetailsModal bookId={1} onClose={onClose} onGone={onGone} />,
    { queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedChapters.listChapters.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedGenres.listGenres.mockResolvedValue({
    items: [genreItem(4, 'Gothic')],
  });
});

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
      genre: publicGenre(4, 'Gothic'),
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

describe('BookEditDetailsModal tabs', () => {
  it('opens on Details with the form, Cover, Co-authors and Delete book', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    renderModal();

    expect(
      await screen.findByRole('dialog', { name: 'Edit book' })
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Title')).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Details',
      'Chapters',
    ]);
    expect(screen.getByRole('heading', { name: 'Cover' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Co-authors' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Add a co-author')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete book' })
    ).toBeInTheDocument();
  });

  it('gives a Moderator the form and Delete book but no co-author picker', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    renderModal({ ...author, id: 99, role: 'admin' });

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete book' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a co-author')).toBeNull();
  });

  it('keeps typed Details values over a Chapters tab round trip and still asks before closing', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('tab', { name: 'Chapters' }));
    expect(await screen.findByText('No chapters yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByLabelText('Title')).toHaveValue('A Tale of Dragons!');

    await userEvent.click(screen.getByRole('tab', { name: 'Chapters' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deletes the book once confirmed, closes and reports it gone', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.deleteBook.mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete book' })
    );
    expect(mockedBooks.deleteBook).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1));
    expect(mockedBooks.deleteBook).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with the server message when the delete is refused', async () => {
    mockedBooks.getBook.mockResolvedValue(bookDetail);
    mockedBooks.deleteBook.mockRejectedValue(
      new Error('You may not delete this book')
    );
    renderModal();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete book' })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(
      await screen.findByText('You may not delete this book')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });
});
