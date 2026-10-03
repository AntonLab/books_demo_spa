import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigationType } from 'react-router';
import { EMPTY_LIBRARY_COUNTS } from 'shared';
import { BookPage } from './BookPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { publicGenre } from '@/test/genres';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import { formatDate } from '@/format/date';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as commentsApi from '@/api/comments';
import * as likesApi from '@/api/likes';
import * as readingListsApi from '@/api/readingLists';
import * as favoritesApi from '@/api/favorites';
import * as genresApi from '@/api/genres';
import * as libraryApi from '@/api/library';
import * as seriesApi from '@/api/series';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';
import type { RootState } from '@/store';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/comments');
jest.mock('@/api/likes');
jest.mock('@/api/favorites');
jest.mock('@/api/readingLists');
jest.mock('@/api/genres');
jest.mock('@/api/library');
jest.mock('@/api/series');
jest.mock('@/api/authors');

const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const mockedComments = jest.mocked(commentsApi);
const mockedLikes = jest.mocked(likesApi);
const mockedFavorites = jest.mocked(favoritesApi);
const mockedReadingLists = jest.mocked(readingListsApi);
const mockedGenres = jest.mocked(genresApi);
const mockedLibrary = jest.mocked(libraryApi);
const mockedSeries = jest.mocked(seriesApi);

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
  genre: publicGenre(4, 'Gothic'),
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: { id: 2, title: 'The Scale Cycle', position: 1 },
  likeCount: 4,
  commentCount: 0,
  wordCount: 0,
  favoriteCount: 2,
  viewerFavoriteId: null,
  viewerReadingStatus: null,
  libraryCounts: EMPTY_LIBRARY_COUNTS,
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
  preloadedState?: Partial<RootState>,
  id = '1'
) => {
  const queryClient = createTestQueryClient();
  if (session) queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(<BookPage />, {
    route: `/books/${id}`,
    path: '/books/:id',
    queryClient,
    preloadedState,
  });
};

const Probe = () => {
  const { pathname } = useLocation();
  return <p>{`${pathname}|${useNavigationType()}`}</p>;
};

const renderWithHome = (
  id: string,
  {
    session,
    preloadedState,
  }: { session?: PublicUser; preloadedState?: Partial<RootState> } = {}
) => {
  const queryClient = createTestQueryClient();
  if (session) queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/books/:id" element={<BookPage />} />
      <Route path="/" element={<Probe />} />
    </Routes>,
    { route: `/books/${id}`, queryClient, preloadedState }
  );
};

const unsavedFor = (
  accountId: number,
  key: string,
  text: string
): Partial<RootState> => ({
  unsavedText: {
    accountId,
    entries: { [key]: { text, savedAt: '2026-09-23T10:00:00.000Z' } },
  },
});

const noLists = { items: [], total: 0, current: 1, pageSize: 10 };

beforeEach(() => {
  jest.resetAllMocks();
  mockedReadingLists.listReadingLists.mockResolvedValue(noLists);
  mockedBooks.getBook.mockResolvedValue(book);
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
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
      await screen.findByRole('link', { name: 'The Scale Cycle · Book 1' })
    ).toHaveAttribute('href', '/series/2');
  });

  it('links a Subgenre and its parent', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      genre: publicGenre(2, 'Urban Fantasy', { id: 1, name: 'Fantasy' }),
    });

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Fantasy' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Urban Fantasy' })
    ).toBeInTheDocument();
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

  it('replaces to Home when the id is not a book id, asking nothing', async () => {
    renderWithHome('new');

    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
    expect(
      await screen.findAllByText('This book no longer exists.')
    ).toHaveLength(1);
    expect(mockedBooks.getBook).not.toHaveBeenCalled();
  });

  it('replaces to Home on a 404', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'gone'));

    renderWithHome('1');

    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
    expect(
      await screen.findAllByText('This book no longer exists.')
    ).toHaveLength(1);
  });

  it('keeps the Alert on a 500, with no redirect', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(500, 'boom'));

    renderWithHome('1');

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
    expect(screen.queryByText('/|REPLACE')).not.toBeInTheDocument();
  });

  it('reports a book that will not load', async () => {
    mockedBooks.getBook.mockRejectedValue(new Error('nope'));

    renderPage();

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
  });

  it('stays and offers the Unsaved text of a book that is gone', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'Book not found'));
    renderWithHome('1', {
      session: reader,
      preloadedState: unsavedFor(
        reader.id,
        'book:1:comment',
        'About that ending'
      ),
    });

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('About that ending');
    expect(screen.queryByText('/|REPLACE')).not.toBeInTheDocument();
  });

  it('redirects when the only Unsaved text is blank', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'gone'));
    renderWithHome('1', {
      session: reader,
      preloadedState: unsavedFor(reader.id, 'book:1:comment', '   '),
    });

    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
  });

  it('redirects when another Account owns the Unsaved text', async () => {
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'gone'));
    renderWithHome('1', {
      session: reader,
      preloadedState: unsavedFor(77, 'book:1:comment', 'theirs'),
    });

    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
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

  it('hides the star from an anonymous visitor', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
  });

  it('offers the star with its count to a co-author too', async () => {
    renderPage({ ...reader, id: 4 });

    expect(
      await screen.findByRole('button', { name: 'Add to favorites' })
    ).toHaveTextContent('2');
  });

  it('adds the book to the reader’s Favorites', async () => {
    mockedFavorites.createFavorite.mockResolvedValue({
      id: 5,
      userId: reader.id,
      bookId: 1,
      seriesId: null,
      createdAt: '2026-09-26T10:00:00.000Z',
    });
    renderPage(reader);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add to favorites' })
    );

    expect(mockedFavorites.createFavorite).toHaveBeenCalledWith({ bookId: 1 });
  });

  it('removes the reader’s own Favorite by its id', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, viewerFavoriteId: 5 });
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    renderPage(reader);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove from favorites' })
    );

    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(5);
  });

  it('holds the star while a toggle is in flight', async () => {
    // Never settles, so the mutation stays pending.
    mockedFavorites.createFavorite.mockReturnValue(new Promise(() => {}));
    renderPage(reader);

    const star = await screen.findByRole('button', {
      name: 'Add to favorites',
    });
    await userEvent.click(star);

    await waitFor(() => expect(star).toBeDisabled());
    expect(mockedFavorites.createFavorite).toHaveBeenCalledTimes(1);
  });

  describe('Add to reading list', () => {
    const addButton = { name: 'Add to reading list' };

    it('is offered to a signed-in reader of a Published Book', async () => {
      mockedBooks.getBook.mockResolvedValue({ ...book, status: 'complete' });
      renderPage(reader);

      expect(await screen.findByRole('button', addButton)).toBeInTheDocument();
    });

    it('is not offered to a Guest', async () => {
      mockedBooks.getBook.mockResolvedValue({ ...book, status: 'complete' });
      renderPage();

      await screen.findByRole('heading', { name: 'A Tale of Dragons' });
      expect(screen.queryByRole('button', addButton)).toBeNull();
    });

    it('is not offered to the Co-author viewing a Draft Book', async () => {
      mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });
      renderPage({ ...reader, id: 4 });

      await screen.findByRole('heading', { name: 'A Tale of Dragons' });
      expect(screen.queryByRole('button', addButton)).toBeNull();
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
      screen.getByRole('tab', { name: 'Comments (0)' })
    ).toBeInTheDocument();
    expect(mockedChapters.listChapters).toHaveBeenCalledWith(1);
    expect(mockedComments.listComments).toHaveBeenCalledWith(1);
  });
});

describe('BookPage lower tabs', () => {
  const listsPage = (total: number) => ({
    items: [
      {
        id: 4,
        title: 'Cold nights',
        description: '',
        tags: [],
        owner: { id: 9, login: 'reader' },
        itemCount: 2,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    total,
    current: 1,
    pageSize: 10,
  });

  it('counts the Comments from the Book and opens on them, the thread inside the tab', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, commentCount: 3 });
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Comments (3)', selected: true })
    ).toBeInTheDocument();
    // The tab label names the region: no second "Comments" heading inside it.
    expect(screen.queryByRole('heading', { name: 'Comments' })).toBeNull();
  });

  it('counts the lists holding the Book before the tab is opened, then lists them with links', async () => {
    mockedReadingLists.listReadingLists.mockResolvedValue(listsPage(1));
    renderPage();

    const tab = await screen.findByRole('tab', { name: 'Reading lists (1)' });
    expect(tab).toHaveAttribute('aria-selected', 'false');
    expect(mockedReadingLists.listReadingLists).toHaveBeenCalledWith({
      bookId: 1,
      current: 1,
      pageSize: 10,
    });

    await userEvent.click(tab);

    expect(
      await screen.findByRole('link', { name: 'Cold nights' })
    ).toHaveAttribute('href', '/lists/4');
  });

  it('shows the empty message on a Book no list holds', async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole('tab', { name: 'Reading lists (0)' })
    );

    expect(
      await screen.findByText('Not in any reading list yet.')
    ).toBeInTheDocument();
  });

  it('labels the Reading lists tab without a count when its request fails, Comments unaffected', async () => {
    mockedReadingLists.listReadingLists.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Reading lists' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Comments (0)' })
    ).toBeInTheDocument();
  });

  it('shows a Guest both lower tabs with their counts and no write controls', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, commentCount: 2 });
    mockedReadingLists.listReadingLists.mockResolvedValue(listsPage(1));
    renderPage();

    expect(
      await screen.findByRole('tab', { name: 'Comments (2)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Reading lists (1)' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Add to reading list' })
    ).toBeNull();
  });

  it('keeps the closed Comments section and an empty Reading lists tab on a Draft', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });
    renderPage({ ...reader, id: 4, role: 'author' });

    expect(
      await screen.findByText('Comments are closed while this book is a draft.')
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('tab', { name: 'Reading lists (0)' })
    );
    expect(
      await screen.findByText('Not in any reading list yet.')
    ).toBeInTheDocument();
  });

  it('raises the Comments count when a Comment is posted and the Book refetches', async () => {
    mockedBooks.getBook
      .mockResolvedValueOnce({ ...book, commentCount: 0 })
      .mockResolvedValue({ ...book, commentCount: 1 });
    mockedComments.createComment.mockResolvedValue({} as never);
    renderPage(reader);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add comment' })
    );
    await userEvent.type(screen.getByRole('textbox'), 'Lovely');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));

    expect(
      await screen.findByRole('tab', { name: 'Comments (1)' })
    ).toBeInTheDocument();
  });
});

describe('Library', () => {
  it('shows the counts to a Guest, without the dropdown', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      libraryCounts: { reading: 1, planToRead: 1, read: 1, inLibraries: 3 },
    });
    renderPage();
    expect(await screen.findByText('In 3 libraries')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Reading status' })
    ).toBeNull();
  });

  it('shows the reader’s own status in the dropdown', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      viewerReadingStatus: 'reading',
    });
    renderPage(reader);
    const select = await screen.findByRole('combobox', {
      name: 'Reading status',
    });
    expect(
      within(select.closest('.ant-select') as HTMLElement).getByText('Reading')
    ).toBeInTheDocument();
  });

  it('sets a status and refetches the book', async () => {
    mockedLibrary.setReadingStatus.mockResolvedValue({
      bookId: 1,
      status: 'reading',
      updatedAt: '2026-10-02T10:00:00.000Z',
    });
    renderPage(reader);
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Reading'));
    expect(mockedLibrary.setReadingStatus).toHaveBeenCalledWith(1, 'reading');
    await waitFor(() => expect(mockedBooks.getBook).toHaveBeenCalledTimes(2));
  });

  it('removes the book from the Library', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      viewerReadingStatus: 'read',
    });
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    renderPage(reader);
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Remove from library'));
    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(1);
  });

  it('toasts a failed change and refetches the book', async () => {
    mockedLibrary.setReadingStatus.mockRejectedValue(
      new ApiError(404, 'Book 1 not found')
    );
    renderPage(reader);
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Read'));
    expect(await screen.findByText('Book 1 not found')).toBeInTheDocument();
    await waitFor(() => expect(mockedBooks.getBook).toHaveBeenCalledTimes(2));
  });

  it('disables the dropdown while a change is in flight', async () => {
    mockedLibrary.setReadingStatus.mockReturnValue(new Promise(() => {}));
    renderPage(reader);
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Read'));
    expect(
      screen.getByRole('combobox', { name: 'Reading status' })
    ).toBeDisabled();
  });
});

describe('BookPage on a draft', () => {
  it('labels the draft and closes it to likes and comments', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });

    renderPage(reader);

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /like/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
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

  it('keeps all four tabs on a draft', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });

    renderPage({ ...reader, id: 4, role: 'author' });

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Chapters',
      'Statistics',
      'Comments (0)',
      'Reading lists (0)',
    ]);
  });
});

describe('BookPage Edit button', () => {
  it('opens the Book edit modal for a co-author, over the page', async () => {
    renderPage({ ...reader, id: 4, role: 'author' });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    // Unnamed: the clicked Edit button keeps focus, and its tooltip then
    // becomes the dialog's accessible name.
    expect(
      within(await screen.findByRole('dialog')).getByText('Edit book')
    ).toBeInTheDocument();
  });

  it('offers a Moderator the same Edit button, and a plain reader none', async () => {
    const { unmount } = renderPage({ ...reader, id: 50, role: 'admin' });
    expect(
      await screen.findByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    unmount();

    renderPage(reader);
    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it.each([
    [
      'a co-author goes to My works',
      { id: 4, role: 'author' as const },
      'My works',
    ],
    ['a moderator goes home', { id: 50, role: 'admin' as const }, 'Home'],
  ])('after delete from the modal, %s', async (_name, who, landing) => {
    mockedBooks.deleteBook.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.session, { ...reader, ...who });
    renderWithProviders(
      <Routes>
        <Route path="/books/:id" element={<BookPage />} />
        <Route path="/" element={<p>Home</p>} />
        <Route path="/profile/my-books" element={<p>My works</p>} />
      </Routes>,
      { route: '/books/1', queryClient }
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete book' })
    );
    // The server no longer has the book once it is deleted, so any refetch of
    // it answers 404.
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'gone'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(await screen.findByText(landing)).toBeInTheDocument();
    expect(screen.queryByText('This book no longer exists.')).toBeNull();
  });
});

describe('BookPage Unsaved text', () => {
  const stateWith = (key: string, accountId: number): Partial<RootState> => ({
    unsavedText: {
      accountId,
      entries: {
        [key]: {
          title: 'Chapter nine',
          text: 'Draft of the ninth chapter',
          savedAt: '2026-09-23T10:00:00.000Z',
        },
      },
    },
  });

  it('offers the text of a book the Account may no longer edit', async () => {
    const user = userEvent.setup();
    renderPage(reader, stateWith('book:1:chapterNew', 9));

    expect(
      await screen.findByRole('textbox', { name: 'Unsaved text' })
    ).toHaveValue('Chapter nine\n\nDraft of the ninth chapter');

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('textbox', { name: 'Unsaved text' })).toBeNull();
  });

  it('shows nothing to a Co-author, who reaches it in the editor', async () => {
    renderPage(
      { ...reader, id: 4, role: 'author' },
      stateWith('book:1:chapterNew', 4)
    );

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('textbox', { name: 'Unsaved text' })).toBeNull();
  });

  it('shows nothing for another book', async () => {
    renderPage(reader, stateWith('book:2:chapterNew', 9));

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.queryByRole('textbox', { name: 'Unsaved text' })).toBeNull();
  });
});

describe('BookPage header and action row', () => {
  const moderator: PublicUser = { ...reader, id: 50, role: 'admin' };

  it('shows the whole description in the header card, under the title', async () => {
    const long = 'Long ago, in a kingdom of scales. '.repeat(30).trim();
    mockedBooks.getBook.mockResolvedValue({ ...book, description: long });
    renderPage();

    expect(await screen.findByText(long)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Description' })).toBeNull();
  });

  it('lays the actions out as Like, Favorite, Library status, Add to reading list, Edit, then the library counts', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'complete' });
    renderPage(moderator);

    const names = [
      await screen.findByRole('button', { name: 'Like' }),
      screen.getByRole('button', { name: 'Add to favorites' }),
      screen.getByRole('combobox', { name: 'Reading status' }),
      screen.getByRole('button', { name: 'Add to reading list' }),
      screen.getByRole('button', { name: 'Edit' }),
      screen.getByText('In 0 libraries'),
    ];
    names.slice(1).forEach((node, index) => {
      expect(
        names[index]!.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  it('shows the Edit icon button with an Edit tooltip', async () => {
    renderPage({ ...reader, id: 4, role: 'author' });

    await userEvent.hover(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByRole('tooltip', { name: 'Edit' })).toBeVisible();
  });

  it('shows a Guest only the library counts under the card', async () => {
    renderPage();

    expect(await screen.findByText('In 0 libraries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
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
  // The lower set's open panel is also a tabpanel, so pick the upper one by
  // its label.
  const openPanel = () =>
    within(screen.getByRole('tabpanel', { name: /^(Chapters|Statistics)$/ }));

  // Each figure is one table cell holding its label and then its value.
  const statistic = (label: string) =>
    openPanel()
      .getByRole('cell', { name: new RegExp(`^${label}`) })
      .textContent?.slice(label.length);

  const openTab = async (name: string) => {
    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    await userEvent.click(screen.getByRole('tab', { name }));
  };

  it('opens on Chapters, the first of two upper tabs, with no Description tab', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Chapters',
      'Statistics',
      'Comments (0)',
      'Reading lists (0)',
    ]);
    expect(
      screen.getByRole('tab', { name: 'Chapters', selected: true })
    ).toBeInTheDocument();
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
      favoriteCount: 2,
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
    expect(statistic('Favorites')).toBe('2');
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
