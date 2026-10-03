import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigationType } from 'react-router';
import { EMPTY_LIBRARY_COUNTS } from 'shared';
import { App, AppShell } from './App';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import * as accountsApi from '@/api/accounts';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as commentsApi from '@/api/comments';
import * as notificationsApi from '@/api/notifications';
import * as seriesApi from '@/api/series';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';
import type { AccountProfile, PublicUser } from '@/types/api';

jest.mock('@/api/accounts');
jest.mock('@/api/auth');
jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/comments');
jest.mock('@/api/notifications');
jest.mock('@/api/series');
jest.mock('@/api/favorites');
jest.mock('@/api/genres');

const mockedAccounts = jest.mocked(accountsApi);
const mockedAuth = jest.mocked(authApi);
const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const mockedComments = jest.mocked(commentsApi);
const mockedSeries = jest.mocked(seriesApi);
const mockedGenres = jest.mocked(genresApi);
const mockedNotifications = jest.mocked(notificationsApi);

const emptyEnvelope = { items: [], total: 0, limit: 100, offset: 0 };

const profile: AccountProfile = {
  id: 7,
  firstName: 'Margaret',
  lastName: 'Hale',
  avatarUrl: null,
  about: '',
  lastSeenAt: null,
  bookCount: 0,
  seriesCount: 0,
  totals: {
    booksInReadingLists: 0,
    seriesInReadingLists: 0,
    bookLikes: 0,
    seriesLikes: 0,
    commentsOnBooks: 0,
    favorites: 0,
  },
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const NavigationProbe = () => (
  <div data-testid="navigation">{useNavigationType()}</div>
);

const expectGoneHome = async (route: string, notice = 'Page not found.') => {
  renderWithProviders(
    <>
      <AppShell />
      <LocationProbe />
      <NavigationProbe />
    </>,
    { route }
  );

  expect(await screen.findAllByText(notice)).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  );
  expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
};

// Every page App.tsx loads lazily. A page's first import transforms and
// evaluates its whole module graph, which in a loaded parallel run outlasts
// findBy*'s 1 s; loading them here leaves each route test waiting only for
// its render, as a browser does once the chunk is cached.
const LAZY_PAGES = [
  'AdminPage',
  'BookPage',
  'ChapterPage',
  'MainPage',
  'ProfilePage',
  'PublicProfilePage',
  'SearchPage',
  'SeriesPage',
];

beforeAll(
  () =>
    Promise.all(LAZY_PAGES.map((page) => import(`@/pages/${page}/${page}`))),
  30_000
);

beforeEach(() => {
  jest.resetAllMocks();
  // Anonymous visitor unless a test says otherwise.
  mockedAuth.me.mockRejectedValue(new ApiError(401, 'Authentication required'));
  // MainPage fetches books from Task 10 onward; a real envelope keeps these
  // routing tests from tripping over an incidental fetch failure.
  mockedBooks.listBooks.mockResolvedValue({
    items: [],
    total: 0,
    current: 1,
    pageSize: 20,
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
    commentCount: 0,
    wordCount: 0,
    favoriteCount: 0,
    viewerFavoriteId: null,
    viewerReadingStatus: null,
    libraryCounts: EMPTY_LIBRARY_COUNTS,
    viewerLikeId: null,
  });
  mockedChapters.listChapters.mockResolvedValue(emptyEnvelope);
  mockedComments.listComments.mockResolvedValue(emptyEnvelope);
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
  mockedSeries.getSeries.mockResolvedValue({
    id: 12,
    coverUrl: null,
    bookCount: 0,
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
    favoriteCount: 0,
    viewerFavoriteId: null,
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

  it('sends the old /books/new bookmark Home with a message, asking the server nothing', async () => {
    await expectGoneHome('/books/new', 'This book no longer exists.');
    expect(mockedBooks.getBook).not.toHaveBeenCalled();
  });

  it('sends the removed /books/:id/edit Home with a message', async () => {
    await expectGoneHome('/books/1/edit');
    expect(mockedBooks.getBook).not.toHaveBeenCalled();
  });

  it('sends the old /series/new bookmark Home with a message, asking the server nothing', async () => {
    await expectGoneHome('/series/new', 'This series no longer exists.');
    expect(mockedSeries.getSeries).not.toHaveBeenCalled();
  });

  it('sends the removed /series/:id/edit Home with a message', async () => {
    await expectGoneHome('/series/12/edit');
    expect(mockedSeries.getSeries).not.toHaveBeenCalled();
  });

  it('sends a bare /series Home with a message', async () => {
    await expectGoneHome('/series');
  });

  it('renders SeriesPage at /series/:id', async () => {
    renderWithProviders(<AppShell />, { route: '/series/12' });

    expect(
      await screen.findByRole('heading', { name: 'The Scale Cycle' })
    ).toBeInTheDocument();
  });

  it.each(['/accounts/abc', '/accounts/0', '/accounts/-3', '/accounts/1.5'])(
    'sends %s Home with a message, asking the server nothing',
    async (route) => {
      await expectGoneHome(route);
      expect(mockedAccounts.getAccountProfile).not.toHaveBeenCalled();
    }
  );

  it('sends a missing, blocked or pending Account Home (404)', async () => {
    mockedAccounts.getAccountProfile.mockRejectedValue(
      new ApiError(404, 'Not found')
    );
    await expectGoneHome('/accounts/9');
  });

  it('renders PublicProfilePage at /accounts/:id for a Guest', async () => {
    mockedAccounts.getAccountProfile.mockResolvedValue(profile);
    renderWithProviders(<AppShell />, { route: '/accounts/7' });

    expect(
      await screen.findByRole('heading', { name: 'Margaret Hale' })
    ).toBeInTheDocument();
  });

  it.each(['/admin/reports', '/admin/genres'])(
    'guards the Admin panel at %s',
    async (route) => {
      renderWithProviders(<AppShell />, { route });

      expect(
        await screen.findByRole('dialog', { name: 'Log in' })
      ).toBeInTheDocument();
    }
  );

  it('redirects /admin to the Reports tab', async () => {
    renderWithProviders(
      <>
        <AppShell />
        <LocationProbe />
      </>,
      { route: '/admin' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/reports')
    );
  });

  it('sends an unknown route Home with a message', async () => {
    await expectGoneHome('/nowhere');
  });

  it('sends a deep unknown route with a query Home with a message', async () => {
    await expectGoneHome('/nowhere/deeper?x=1');
  });
});

describe('AppShell footer', () => {
  it.each(['/', '/search'])('shows the footer at %s', async (route) => {
    renderWithProviders(<AppShell />, { route });

    const footer = await screen.findByRole('contentinfo');
    expect(footer).toHaveTextContent('© 2026 Books Demo');
    expect(
      within(footer).getByRole('link', { name: 'Search' })
    ).toHaveAttribute('href', '/search');
  });
});

describe('removed Chapter pages', () => {
  it.each([['/books/1/chapters/9/edit'], ['/books/1/chapters/new']])(
    'redirects %s to the Book page without opening a chapter',
    async (route) => {
      renderWithProviders(
        <>
          <AppShell />
          <LocationProbe />
        </>,
        { route }
      );

      expect(
        await screen.findByRole('heading', { name: 'A Tale of Dragons' })
      ).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/books\/1$/);
      expect(mockedChapters.getChapter).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Log in' })).toBeNull();
    }
  );

  it('replaces the history entry, so Back does not return to the dead route', async () => {
    const NavigationProbe = () => (
      <div data-testid="navigation">{useNavigationType()}</div>
    );
    renderWithProviders(
      <>
        <AppShell />
        <NavigationProbe />
      </>,
      { route: '/books/1/chapters/9/edit' }
    );

    await screen.findByRole('heading', { name: 'A Tale of Dragons' });

    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
  });
});

describe('AppShell Profile routing', () => {
  it.each([
    '/profile',
    '/profile/favorites',
    '/profile/library',
    '/profile/my-books',
  ])('guards ProfilePage at %s', async (route) => {
    renderWithProviders(<AppShell />, { route });

    expect(
      await screen.findByRole('dialog', { name: 'Log in' })
    ).toBeInTheDocument();
  });

  it('redirects /favorites to /profile/favorites', async () => {
    renderWithProviders(
      <>
        <AppShell />
        <LocationProbe />
      </>,
      { route: '/favorites' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/profile/favorites'
      )
    );
  });

  it('redirects /my-books to /profile/my-books', async () => {
    renderWithProviders(
      <>
        <AppShell />
        <LocationProbe />
      </>,
      { route: '/my-books' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/profile/my-books'
      )
    );
  });

  it('keeps a Profile tab’s own state across a switch to another tab and back', async () => {
    const signedIn: PublicUser = {
      id: 5,
      login: 'ann',
      email: 'ann@example.com',
      firstName: 'Ann',
      lastName: 'Annson',
      status: 'active',
      role: 'user',
      avatarUrl: null,
      about: '',
      showLastSeen: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    mockedAuth.me.mockResolvedValue(signedIn);
    mockedNotifications.listNotifications.mockResolvedValue({
      items: [],
      total: 0,
      unread: 0,
      limit: 20,
      offset: 0,
    });
    mockedNotifications.getNotificationSettings.mockResolvedValue({
      emailNotifications: true,
    });
    mockedBooks.listFavoritedBooks.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 20,
    });

    renderWithProviders(<AppShell />, { route: '/profile' });
    await screen.findByRole('button', { name: 'Upload avatar' });

    const user = userEvent.setup({ applyAccept: false });
    const badFile = new File([new Uint8Array([1])], 'me.gif', {
      type: 'image/gif',
    });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, badFile);
    expect(
      await screen.findByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Favorites' }));
    await screen.findByRole('tab', { name: 'Books' });
    await user.click(screen.getByRole('tab', { name: 'Account' }));

    expect(
      screen.getByText('Choose a JPEG, PNG or WebP image.')
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

describe('AppShell and Unsaved text', () => {
  it('binds the Unsaved text to the Account signed in', async () => {
    const signedIn: PublicUser = {
      id: 1,
      login: 'bob',
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Bobson',
      status: 'active',
      role: 'user',
      avatarUrl: null,
      about: '',
      showLastSeen: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    mockedAuth.me.mockResolvedValue(signedIn);
    // The bell a signed-in header shows asks for these.
    mockedNotifications.listNotifications.mockResolvedValue({
      items: [],
      total: 0,
      unread: 0,
      limit: 20,
      offset: 0,
    });

    const { store } = renderWithProviders(<AppShell />, {
      preloadedState: {
        unsavedText: {
          accountId: 2,
          entries: {
            'book:1:comment': {
              text: 'Not yours',
              savedAt: '2026-09-23T10:00:00.000Z',
            },
          },
        },
      },
    });

    await waitFor(() =>
      expect(store.getState().unsavedText).toEqual({
        accountId: 1,
        entries: {},
      })
    );
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
