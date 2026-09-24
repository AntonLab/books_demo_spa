import { render, screen } from '@testing-library/react';
import { App, AppShell } from './App';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as commentsApi from '@/api/comments';
import * as seriesApi from '@/api/series';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';

jest.mock('@/api/auth');
jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/comments');
jest.mock('@/api/notifications');
jest.mock('@/api/series');
jest.mock('@/api/genres');

const mockedAuth = jest.mocked(authApi);
const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const mockedComments = jest.mocked(commentsApi);
const mockedSeries = jest.mocked(seriesApi);
const mockedGenres = jest.mocked(genresApi);

const emptyEnvelope = { items: [], total: 0, limit: 100, offset: 0 };

beforeEach(() => {
  jest.resetAllMocks();
  // Anonymous visitor unless a test says otherwise.
  mockedAuth.me.mockRejectedValue(new ApiError(401, 'Authentication required'));
  // MainPage fetches books from Task 10 onward; a real envelope keeps these
  // routing tests from tripping over an incidental fetch failure.
  mockedBooks.listBooks.mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
  mockedBooks.getBook.mockResolvedValue({
    id: 1,
    authors: [
      {
        id: 3,
        login: 'Author',
        firstName: 'Ann',
        lastName: 'Author',
        avatarUrl: null,
      },
    ],
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
    viewerLikeId: null,
  });
  mockedChapters.listChapters.mockResolvedValue(emptyEnvelope);
  mockedComments.listComments.mockResolvedValue(emptyEnvelope);
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
  mockedSeries.getSeries.mockResolvedValue({
    id: 12,
    authors: [
      {
        id: 3,
        login: 'Author',
        firstName: 'Ann',
        lastName: 'Author',
        avatarUrl: null,
      },
    ],
    title: 'The Scale Cycle',
    description: 'Dragons.',
    tags: [],
    genre: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
});

describe('AppShell routing', () => {
  it('renders MainPage at /', async () => {
    renderWithProviders(<AppShell />, { route: '/' });

    expect(
      await screen.findByRole('heading', { name: 'Popular' })
    ).toBeInTheDocument();
  });

  it('opens the confirm modal over MainPage at the emailed reset link', async () => {
    renderWithProviders(<AppShell />, {
      route: '/reset-password?token=tok-123',
    });

    expect(
      await screen.findByRole('heading', { name: 'Popular' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Choose a new password' })
    ).toBeInTheDocument();
  });

  it('renders BookPage at /books/:id', async () => {
    renderWithProviders(<AppShell />, { route: '/books/1' });

    expect(
      await screen.findByRole('heading', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
  });

  it('renders ChapterPage at /books/:bookId/chapters/:chapterId', async () => {
    mockedChapters.getChapter.mockResolvedValue({
      id: 9,
      bookId: 1,
      title: 'Chapter One',
      text: 'It was a dark night.',
      publishedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    renderWithProviders(<AppShell />, { route: '/books/1/chapters/9' });

    expect(
      await screen.findByRole('heading', { name: 'Chapter One' })
    ).toBeInTheDocument();
  });

  it('renders NewBookPage at /books/new, not BookPage', async () => {
    renderWithProviders(<AppShell />, { route: '/books/new' });

    // An anonymous visitor: the page explains itself instead of a form.
    expect(
      await screen.findByText(
        'Only an account holding the author role can create books.'
      )
    ).toBeInTheDocument();
    expect(mockedBooks.getBook).not.toHaveBeenCalled();
  });

  it('renders EditBookPage at /books/:id/edit', async () => {
    renderWithProviders(<AppShell />, { route: '/books/1/edit' });

    expect(
      await screen.findByText('Only its co-authors can edit this book.')
    ).toBeInTheDocument();
  });

  it('renders NewChapterPage at /books/:bookId/chapters/new, not the reader', async () => {
    renderWithProviders(<AppShell />, { route: '/books/1/chapters/new' });

    expect(
      await screen.findByText(
        'Only its co-authors can add chapters to this book.'
      )
    ).toBeInTheDocument();
    expect(mockedChapters.getChapter).not.toHaveBeenCalled();
  });

  it('renders EditChapterPage at /books/:bookId/chapters/:chapterId/edit', async () => {
    mockedChapters.getChapter.mockResolvedValue({
      id: 9,
      bookId: 1,
      title: 'Chapter One',
      text: 'It was a dark night.',
      publishedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    renderWithProviders(<AppShell />, { route: '/books/1/chapters/9/edit' });

    expect(
      await screen.findByText('Only its co-authors can edit this chapter.')
    ).toBeInTheDocument();
  });

  it('renders NewSeriesPage at /series/new', async () => {
    renderWithProviders(<AppShell />, { route: '/series/new' });

    expect(
      await screen.findByText(
        'Only an account holding the author role can create series.'
      )
    ).toBeInTheDocument();
  });

  it('renders EditSeriesPage at /series/:id/edit', async () => {
    renderWithProviders(<AppShell />, { route: '/series/12/edit' });

    expect(
      await screen.findByText('Only its co-authors can edit this series.')
    ).toBeInTheDocument();
  });

  it('has no page at /series: a series is found through its books', async () => {
    renderWithProviders(<AppShell />, { route: '/series' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument();
  });

  it('renders the my-books stub at /my-books', async () => {
    renderWithProviders(<AppShell />, { route: '/my-books' });

    expect(
      await screen.findByRole('heading', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('renders the profile page at /profile', async () => {
    renderWithProviders(<AppShell />, { route: '/profile' });

    expect(
      await screen.findByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
  });

  it('renders AdminGenresPage at /admin/genres', async () => {
    renderWithProviders(<AppShell />, { route: '/admin/genres' });

    // An anonymous visitor: the page explains itself instead of the manager.
    expect(
      await screen.findByText('Genres are kept by admins.')
    ).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown route', async () => {
    renderWithProviders(<AppShell />, { route: '/nowhere' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument();
  });
});

describe('AppShell session bootstrap', () => {
  it('asks the server who is logged in on mount', async () => {
    renderWithProviders(<AppShell />);

    await screen.findByRole('heading', { name: 'Popular' });
    // AppHeader reading useSession() is what fires this; there is no longer
    // an explicit dispatch on mount.
    expect(mockedAuth.me).toHaveBeenCalledTimes(1);
  });

  it('settles to a signed-out header when the visitor is anonymous', async () => {
    renderWithProviders(<AppShell />);

    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
  });
});

describe('App', () => {
  // The composition root: QueryClientProvider > Provider > StyleProvider >
  // ThemedConfigProvider > AntdApp > BrowserRouter > AppShell, mounted for
  // real rather than swapped for MemoryRouter and a fresh query client the
  // way every other suite in this file does. BrowserRouter reads the jsdom
  // URL, which defaults to http://localhost/, so this exercises MainPage the
  // same way the "renders MainPage at /" case above does — just through the
  // real tree instead of AppShell in isolation.
  it('renders the real composition root at /', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Popular' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Search books')).toBeInTheDocument();
  });
});
