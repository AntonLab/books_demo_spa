import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookPage } from './BookPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as commentsApi from '@/api/comments';
import * as likesApi from '@/api/likes';
import type { BookDetail } from '@/types/book';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/comments');
jest.mock('@/api/likes');

const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const mockedComments = jest.mocked(commentsApi);
const mockedLikes = jest.mocked(likesApi);

const book: BookDetail = {
  id: 1,
  userId: 3,
  seriesId: 2,
  title: 'A Tale of Dragons',
  description: 'Long ago, in a kingdom of scales.',
  tags: ['epic'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  author: { id: 3, login: 'Author', firstName: 'Ann', lastName: 'Author' },
  series: { id: 2, title: 'The Scale Cycle' },
  likeCount: 4,
  viewerLikeId: null,
};

const reader: PublicUser = {
  id: 9,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderPage = (session?: PublicUser) => {
  const queryClient = createTestQueryClient();
  if (session) queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(<BookPage />, {
    route: '/books/1',
    path: '/books/:id',
    queryClient,
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(book);
  mockedChapters.listChapters.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedComments.listComments.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
});

describe('BookPage', () => {
  it('fetches the book named in the route', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });

    expect(mockedBooks.getBook).toHaveBeenCalledWith(1);
  });

  it('renders the title, author and annotation', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ann Author')).toBeInTheDocument();
    expect(
      screen.getByText('Long ago, in a kingdom of scales.')
    ).toBeInTheDocument();
  });

  it('links the series', async () => {
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'The Scale Cycle' })
    ).toBeInTheDocument();
  });

  it('omits the series link on a standalone book', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, series: null });

    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('link', { name: 'The Scale Cycle' })).toBeNull();
  });

  it('reports a book that will not load', async () => {
    mockedBooks.getBook.mockRejectedValue(new Error('nope'));

    renderPage();

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
  });

  it('hides the like button from an anonymous visitor', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
  });

  it('hides the like button from the author', async () => {
    // The server refuses a self-like with 403, so it is never offered.
    renderPage({ ...reader, id: book.author.id });

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
  });

  it('likes the book for a signed-in reader', async () => {
    mockedLikes.createLike.mockResolvedValue({
      id: 7,
      userId: reader.id,
      bookId: 1,
      commentId: null,
      isLike: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    });

    renderPage(reader);
    await screen.findByRole('heading', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByRole('button', { name: 'Like' }));

    expect(mockedLikes.createLike).toHaveBeenCalledWith({
      bookId: 1,
      isLike: true,
    });
  });

  it('renders the chapters and the comments sections', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Chapters' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Comments' })
    ).toBeInTheDocument();
    expect(mockedChapters.listChapters).toHaveBeenCalledWith(1);
    expect(mockedComments.listComments).toHaveBeenCalledWith(1);
  });
});
