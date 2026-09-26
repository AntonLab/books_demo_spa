import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookPage } from './BookPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import { formatDate } from '@/format/date';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as commentsApi from '@/api/comments';
import * as likesApi from '@/api/likes';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';
import type { RootState } from '@/store';
import type { PublicUser } from '@/types/api';

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
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
    {
      id: 4,
      login: 'Cowriter',
      firstName: 'Cora',
      lastName: 'Writer',
      avatarUrl: null,
    },
  ],
  seriesId: 2,
  title: 'A Tale of Dragons',
  description: 'Long ago, in a kingdom of scales.',
  tags: ['epic'],
  status: 'in_progress',
  genre: { id: 4, name: 'Gothic' },
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: { id: 2, title: 'The Scale Cycle' },
  likeCount: 4,
  commentCount: 0,
  wordCount: 0,
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
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderPage = (
  session?: PublicUser,
  preloadedState?: Partial<RootState>
) => {
  const queryClient = createTestQueryClient();
  if (session) queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(<BookPage />, {
    route: '/books/1',
    path: '/books/:id',
    queryClient,
    preloadedState,
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

  it('renders the title, every co-author and the annotation', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    // Each name carries a trailing comma except the last — so this also
    // pins credit order: reversing the fixture would move the comma.
    expect(screen.getByText('Ann Author,')).toBeInTheDocument();
    expect(screen.getByText('Cora Writer')).toBeInTheDocument();
    expect(
      screen.getByText('Long ago, in a kingdom of scales.')
    ).toBeInTheDocument();
  });

  it('shows the cover image when the book has one', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=1',
    });
    const { container } = renderPage();

    await screen.findByText('A Tale of Dragons');
    expect(
      container.querySelector('img[src="/api/books/1/cover?v=1"]')
    ).toHaveAttribute('alt', '');
  });

  it('shows a co-author’s avatar picture when they have one', async () => {
    // Not screen.getByRole('img'): the avatar is aria-hidden (Task 14's
    // ruling), so a container query by src is the unambiguous way to reach
    // it, and it also disambiguates it from the book's own Cover image.
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      authors: [
        { ...book.authors[0]!, avatarUrl: '/api/users/3/avatar?v=1' },
        book.authors[1]!,
      ],
    });
    const { container } = renderPage();

    // Not findByText: with no coverUrl, BookCover's placeholder repeats the
    // title as aria-hidden text, so the heading role disambiguates it.
    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(
      container.querySelector('img[src="/api/users/3/avatar?v=1"]')
    ).toBeInTheDocument();
  });

  it('links the series to its page', async () => {
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'The Scale Cycle' })
    ).toHaveAttribute('href', '/series/2');
  });

  it('omits the series link on a standalone book', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, series: null });

    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('link', { name: 'The Scale Cycle' })).toBeNull();
  });

  it('links the genre to its results', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Gothic' })).toHaveAttribute(
      'href',
      '/search?genre=4'
    );
  });

  it('omits the genre link on a book without one', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, genre: null });

    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('link', { name: 'Gothic' })).toBeNull();
  });

  it('reports a book that will not load', async () => {
    mockedBooks.getBook.mockRejectedValue(new Error('nope'));

    renderPage();

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
  });

  it('offers the Unsaved text of a book that no longer exists', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'Book not found'));
    renderPage(reader, {
      unsavedText: {
        accountId: 9,
        entries: {
          'book:1:comment': {
            text: 'About that ending',
            savedAt: '2026-09-23T10:00:00.000Z',
          },
        },
      },
    });

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('About that ending');
  });

  it('hides the like button from an anonymous visitor', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
  });

  it('hides the like button from every co-author, not only the first', async () => {
    // The server refuses a like from any Co-author with 403, so it is never
    // offered. The second credit is the one a first-author check would miss.
    renderPage({ ...reader, id: 4 });

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

  it('renders the chapters tab and the comments section', async () => {
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Chapters' })
    ).toBeInTheDocument();
    // The tab took the old section's place, heading and all.
    expect(screen.queryByRole('heading', { name: 'Chapters' })).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Comments' })
    ).toBeInTheDocument();
    expect(mockedChapters.listChapters).toHaveBeenCalledWith(1);
    expect(mockedComments.listComments).toHaveBeenCalledWith(1);
  });
});

describe('BookPage on a draft', () => {
  it('labels the draft and closes it to likes and comments', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });

    renderPage(reader);

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
    expect(
      await screen.findByText('Comments are closed while this book is a draft.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('labels a published book with its status', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'complete' });

    renderPage();

    expect(await screen.findByText('Complete')).toBeInTheDocument();
  });

  it('keeps all three tabs on a draft', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });

    renderPage({ ...reader, id: 4, role: 'author' });

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Description',
      'Chapters',
      'Statistics',
    ]);
  });
});

describe('BookPage edit link', () => {
  it('offers Edit to every co-author', async () => {
    renderPage({ ...reader, id: 4, role: 'author' });

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/books/1/edit'
    );
  });

  it('offers Edit to nobody else', async () => {
    renderPage(reader);

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  });
});

describe('BookPage tabs', () => {
  const chapter: ChapterSummary = {
    id: 21,
    bookId: 1,
    title: 'The Gate',
    publishedAt: '2026-09-03T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  const chaptersPage = (items: ChapterSummary[]) => ({
    items,
    total: items.length,
    limit: 100,
    offset: 0,
  });

  // A Co-author: the server hands them every chapter, Draft and Scheduled
  // included, which is what the public tabs must filter out.
  const coAuthor: PublicUser = { ...reader, id: 4, role: 'author' };

  // Only the open tab's panel: antd marks the others aria-hidden, which role
  // queries skip.
  const openPanel = () => within(screen.getByRole('tabpanel'));

  // antd's non-bordered Descriptions puts each value in the span right after
  // its label.
  const statistic = (label: string) =>
    openPanel().getByText(label).nextElementSibling?.textContent;

  const openTab = async (name: string) => {
    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    await userEvent.click(screen.getByRole('tab', { name }));
  };

  it('opens on Description, the first of three tabs', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Description',
      'Chapters',
      'Statistics',
    ]);
    expect(
      screen.getByRole('tab', { name: 'Description', selected: true })
    ).toBeInTheDocument();
    expect(
      openPanel().getByText('Long ago, in a kingdom of scales.')
    ).toBeInTheDocument();
  });

  it('shows a placeholder for a description that is only blanks', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, description: ' \n\t ' });

    renderPage();

    expect(await screen.findByText('No description yet.')).toBeInTheDocument();
  });

  it('numbers only the published chapters, even for a Co-author', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      chaptersPage([
        chapter,
        { ...chapter, id: 22, title: 'Unfinished', publishedAt: null },
        {
          ...chapter,
          id: 23,
          title: 'Coming soon',
          publishedAt: '2999-01-01T00:00:00.000Z',
        },
        {
          ...chapter,
          id: 24,
          title: 'Chapter 3: The Keep',
          publishedAt: '2026-09-05T00:00:00.000Z',
        },
      ])
    );
    renderPage(coAuthor);

    await openTab('Chapters');

    await openPanel().findByRole('link', { name: 'The Gate' });
    // No gap where the Draft and the Scheduled chapter sit, and a title's own
    // number stays as written.
    expect(
      openPanel()
        .getAllByRole('link')
        .map((link) => link.parentElement?.textContent)
    ).toEqual(['1. The Gate', '2. Chapter 3: The Keep']);
  });

  it('shows the figures, counting and dating only what is out', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      likeCount: 4,
      commentCount: 7,
      wordCount: 1234,
    });
    mockedChapters.listChapters.mockResolvedValue(
      chaptersPage([
        // First in Reading order, published last.
        { ...chapter, publishedAt: '2026-09-10T00:00:00.000Z' },
        { ...chapter, id: 22, publishedAt: null },
        { ...chapter, id: 23, publishedAt: '2026-09-02T00:00:00.000Z' },
        { ...chapter, id: 24, publishedAt: '2999-01-01T00:00:00.000Z' },
      ])
    );
    renderPage(coAuthor);

    await openTab('Statistics');

    await waitFor(() => expect(statistic('Chapters')).toBe('2'));
    expect(statistic('Words')).toBe('1,234');
    expect(statistic('Likes')).toBe('4');
    expect(statistic('Comments')).toBe('7');
    expect(statistic('Release time')).toBe(
      formatDate('2026-09-02T00:00:00.000Z')
    );
    expect(statistic('Last update')).toBe(
      formatDate('2026-09-10T00:00:00.000Z')
    );
  });

  it('dates nothing on a book with no published chapter', async () => {
    mockedChapters.listChapters.mockResolvedValue(
      chaptersPage([{ ...chapter, publishedAt: null }])
    );
    renderPage(coAuthor);

    await openTab('Statistics');

    await waitFor(() => expect(statistic('Chapters')).toBe('0'));
    expect(statistic('Release time')).toBe('—');
    expect(statistic('Last update')).toBe('—');
  });
});
