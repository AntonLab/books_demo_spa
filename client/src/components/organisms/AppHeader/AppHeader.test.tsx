import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router';
import { NOTIFICATION_STREAM_EVENT } from 'shared';
import { AppHeader } from './AppHeader';
import { renderWithProviders } from '@/test/renderWithProviders';
import { genreItem } from '@/test/genres';
import { searchPath } from '@/types/bookSearch';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import * as notificationsApi from '@/api/notifications';
import * as genresApi from '@/api/genres';
import { ApiError } from '@/api/client';
import { FakeEventSource } from '@/test/eventSource';
import type { CreditNotification, PublicUser, SessionUser } from '@/types/api';

jest.mock('@/api/auth');
jest.mock('@/api/notifications');
jest.mock('@/api/genres');

const mockedAuth = jest.mocked(authApi);
const mockedNotifications = jest.mocked(notificationsApi);
const mockedGenres = jest.mocked(genresApi);

const user: PublicUser = {
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

// Seeds the session cache so the header renders a settled state without
// waiting on a request.
const withSession = (session: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return { queryClient };
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedNotifications.listNotifications.mockResolvedValue({
    items: [],
    total: 0,
    unread: 0,
    limit: 20,
    offset: 0,
  });
  mockedGenres.listGenres.mockResolvedValue({
    items: [genreItem(3, 'Gothic'), genreItem(4, 'Hard SF')],
  });
});

// rc-menu registers each item in an effect and re-renders on the next
// microtask (useKeyRecords → nextSlice), after render()'s own act() has
// returned. Flushing that microtask inside act() keeps the re-render from
// warning in every test that asserts without awaiting anything.
const renderHeader = async (
  ...args: Parameters<typeof renderWithProviders>
): Promise<ReturnType<typeof renderWithProviders>> => {
  const result = renderWithProviders(...args);
  await act(async () => {});
  return result;
};

// Renders the current URL so a test can assert where a menu item navigated to.
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

describe('AppHeader while the session is loading', () => {
  it('shows neither Log in nor an avatar', async () => {
    // Never resolves, so the query stays pending for the assertion.
    mockedAuth.me.mockReturnValue(new Promise<SessionUser>(() => {}));

    await renderHeader(<AppHeader />);

    expect(screen.queryByRole('menuitem', { name: 'Log in' })).toBeNull();
    expect(screen.queryByText('bob')).toBeNull();
  });
});

describe('AppHeader navigation', () => {
  it('has no Series item, since the header has no series list to link to', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    expect(screen.getByRole('menuitem', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Series' })).toBeNull();
  });

  it('never shows My works in the nav, not even for an author', async () => {
    await renderHeader(<AppHeader />, withSession({ ...user, role: 'author' }));

    expect(screen.queryByRole('menuitem', { name: 'My works' })).toBeNull();
  });

  it('shows a decorative header image before the navigation', async () => {
    const { container } = await renderHeader(<AppHeader />, withSession(null));
    const image = container.querySelector('header img');
    expect(image).toHaveAttribute('alt', '');
    expect(image?.getAttribute('src')).toMatch(/header\.svg$/);
    expect(image?.nextElementSibling).toBe(
      container.querySelector('header .ant-menu')
    );
  });
});

describe('AppHeader when logged out', () => {
  it('offers Log in as a menu item, and no Register', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    expect(
      screen.getByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
    // Registration stays one click further on, through the login modal's
    // "Create an account".
    expect(screen.queryByText('Register')).toBeNull();
  });

  it('has no notifications to show and asks for none', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    expect(mockedNotifications.listNotifications).not.toHaveBeenCalled();
  });

  it('opens the login modal when Log in is clicked', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Log in' }));

    expect(
      await screen.findByRole('dialog', { name: 'Log in' })
    ).toBeInTheDocument();
  });

  it('switches between the modals and closes them', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Log in' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create an account' })
    );
    expect(
      await screen.findByRole('dialog', { name: 'Create an account' })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('AppHeader when logged in', () => {
  it('shows the notification bell, with the unread count', async () => {
    mockedNotifications.listNotifications.mockResolvedValue({
      items: [],
      total: 4,
      unread: 4,
      limit: 20,
      offset: 0,
    });
    await renderHeader(<AppHeader />, withSession(user));

    expect(
      await screen.findByRole('button', { name: 'Notifications, 4 unread' })
    ).toBeInTheDocument();
  });

  it('shows the login name instead of Log in', async () => {
    await renderHeader(<AppHeader />, withSession(user));

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Log in' })).toBeNull();
  });

  it('shows the avatar image once the account has one', async () => {
    // Not getByRole('img'): antd's Input.Search and Menu render their own
    // icons as SVGs with role="img", so an actual <img> tag is the
    // unambiguous query here; the header's own decorative image shares the
    // page, so the query names the avatar's URL.
    const { container } = await renderHeader(
      <AppHeader />,
      withSession({ ...user, avatarUrl: '/api/users/1/avatar?v=1' })
    );

    expect(
      container.querySelector('img[src="/api/users/1/avatar?v=1"]')
    ).toBeInTheDocument();
  });

  it('logs out through the dropdown, discarding the Unsaved text', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const { queryClient, store } = await renderHeader(<AppHeader />, {
      ...withSession(user),
      preloadedState: {
        unsavedText: {
          accountId: 1,
          entries: {
            'book:1:comment': {
              text: 'Half a thought',
              savedAt: '2026-09-23T10:00:00.000Z',
            },
          },
        },
      },
    });

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Log out'));

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
    });
    expect(mockedAuth.logout).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
    expect(store.getState().unsavedText.entries).toEqual({});
  });

  it('is reachable by keyboard and opens the dropdown on Enter', async () => {
    await renderHeader(<AppHeader />, withSession(user));

    // A bare <Space>/<div> trigger would never receive focus via Tab, so
    // this pins the account trigger being a real focusable control rather
    // than only clickable.
    const trigger = screen.getByRole('button', { name: /bob/i });

    for (let i = 0; i < 20 && document.activeElement !== trigger; i++) {
      await userEvent.tab();
    }
    expect(document.activeElement).toBe(trigger);

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText('Log out')).toBeInTheDocument();
  });
});

describe('AppHeader genres submenu', () => {
  it('opens the submenu and lists every genre in the order given', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    const genresTrigger = await screen.findByRole('menuitem', {
      name: /Genres/,
    });
    await userEvent.click(genresTrigger);
    await screen.findByRole('menuitem', { name: 'Gothic' });

    expect(mockedGenres.listGenres).toHaveBeenCalledWith({ nonEmpty: true });

    // Scoped to the submenu's own popup — found through the ARIA relationship
    // the trigger already declares via `aria-controls` — rather than the
    // whole document, so this pins the render order rather than membership:
    // an accidental alphabetical sort would still satisfy two separate
    // toBeInTheDocument assertions.
    const popupId = genresTrigger.getAttribute('aria-controls');
    const popup = popupId ? document.getElementById(popupId) : null;
    if (!popup) {
      throw new Error('Genres submenu popup not found');
    }
    const items = within(popup).getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Gothic',
      'Hard SF',
    ]);
  });

  it('navigates to the genre its item names', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(null)
    );

    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Genres/ })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Gothic' })
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/search?genre=3');
  });

  it('highlights the genre the page is showing', async () => {
    await renderHeader(<AppHeader />, {
      ...withSession(null),
      route: '/search?genre=3',
    });

    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Genres/ })
    );

    // Selection is a class, not aria-selected: rc-menu sets that only for
    // role="option".
    expect(await screen.findByRole('menuitem', { name: 'Gothic' })).toHaveClass(
      'ant-menu-item-selected'
    );
  });

  it('shows a plain link for a Genre without Subgenres', async () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [
        genreItem(1, 'Fantasy'),
        genreItem(2, 'Urban Fantasy', 1),
        genreItem(3, 'Horror'),
      ],
    });
    await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Genres' })
    );
    const horror = await screen.findByRole('menuitem', { name: 'Horror' });

    expect(within(horror).getByRole('link')).toHaveAttribute(
      'href',
      searchPath({ genre: '3' })
    );
  });

  it('opens a submenu for a Genre with Subgenres, its own link first', async () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [
        genreItem(1, 'Fantasy'),
        genreItem(2, 'Urban Fantasy', 1),
        genreItem(3, 'Horror'),
      ],
    });
    await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Genres' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Fantasy' })
    );
    // The submenu mounts after the click, so find it by its own entry.
    const popup = (
      await screen.findByRole('menuitem', { name: 'Urban Fantasy' })
    ).closest<HTMLElement>('[role="menu"]')!;
    const entries = within(popup)
      .getAllByRole('menuitem')
      .map((entry) => entry.textContent);

    expect(entries).toEqual(['Fantasy', 'Urban Fantasy']);
    expect(
      within(
        within(popup).getByRole('menuitem', { name: 'Fantasy' })
      ).getByRole('link')
    ).toHaveAttribute('href', searchPath({ genre: '1' }));
  });

  it('lists a Subgenre whose parent is missing as a top-level item', async () => {
    mockedGenres.listGenres.mockResolvedValue({
      items: [genreItem(9, 'Lost', 99)],
    });
    await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Genres' })
    );
    const lost = await screen.findByRole('menuitem', { name: 'Lost' });

    expect(within(lost).getByRole('link')).toHaveAttribute(
      'href',
      searchPath({ genre: '9' })
    );
  });

  it('still highlights Home at /', async () => {
    await renderHeader(<AppHeader />, { ...withSession(null), route: '/' });

    expect(screen.getByRole('menuitem', { name: 'Home' })).toHaveClass(
      'ant-menu-item-selected'
    );
  });

  it('leaves the submenu out entirely when there are no genres', async () => {
    mockedGenres.listGenres.mockResolvedValue({ items: [] });

    await renderHeader(<AppHeader />, withSession(null));

    await screen.findByRole('menuitem', { name: 'Home' });
    expect(screen.queryByRole('menuitem', { name: /Genres/ })).toBeNull();
  });

  it('leaves the submenu out when the list will not load', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    await renderHeader(<AppHeader />, withSession(null));

    await screen.findByRole('menuitem', { name: 'Home' });
    expect(screen.queryByRole('menuitem', { name: /Genres/ })).toBeNull();
  });
});

describe('AppHeader account menu', () => {
  const admin: PublicUser = { ...user, role: 'admin' };

  it('offers Favorites after Profile, then the Admin panel to an admin', async () => {
    await renderHeader(<AppHeader />, withSession(admin));

    await userEvent.click(screen.getByText('bob'));
    await screen.findByText('Admin panel');

    // Scoped to the account dropdown's own popup — its rendered class, not
    // an index or the nav menu on the left, which is also role="menu" — so
    // this pins the Admin panel landing right after Profile rather than merely
    // existing somewhere in the menu.
    const dropdown = document.querySelector<HTMLElement>('.ant-dropdown-menu');
    if (!dropdown) {
      throw new Error('account dropdown popup not found');
    }
    const items = within(dropdown).getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Profile',
      'Favorites',
      'Library',
      'Reading lists',
      'Admin panel',
      'Log out',
    ]);
  });

  it('offers the Admin panel to a superadmin', async () => {
    await renderHeader(
      <AppHeader />,
      withSession({ ...user, role: 'superadmin' })
    );

    await userEvent.click(screen.getByText('bob'));

    expect(await screen.findByText('Admin panel')).toBeInTheDocument();
  });

  it('hides the Admin panel from every other role', async () => {
    await renderHeader(<AppHeader />, withSession({ ...user, role: 'author' }));

    await userEvent.click(screen.getByText('bob'));

    // Profile is there, so the menu really did open before this claim.
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.queryByText('Admin panel')).toBeNull();
  });

  it('offers My works to an author, between Favorites and the divider', async () => {
    await renderHeader(<AppHeader />, withSession({ ...user, role: 'author' }));

    await userEvent.click(screen.getByText('bob'));
    await screen.findByText('My works');

    const dropdown = document.querySelector<HTMLElement>('.ant-dropdown-menu');
    if (!dropdown) {
      throw new Error('account dropdown popup not found');
    }
    const items = within(dropdown).getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Profile',
      'Favorites',
      'Library',
      'Reading lists',
      'My works',
      'Log out',
    ]);
  });

  it('hides My works from every other role', async () => {
    await renderHeader(<AppHeader />, withSession(user));

    await userEvent.click(screen.getByText('bob'));
    await screen.findByText('Profile');

    expect(screen.queryByText('My works')).toBeNull();
  });

  it('opens the My works tab from the menu', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession({ ...user, role: 'author' })
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('My works'));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/profile/my-books'
    );
  });

  it('navigates to the Admin panel when it is clicked', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(admin)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Admin panel'));

    expect(screen.getByTestId('location')).toHaveTextContent('/admin');
  });

  it('opens the Library tab from the menu', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(user)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Library'));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/profile/library'
    );
  });

  it('opens the Reading lists tab from the menu', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(user)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Reading lists'));

    expect(screen.getByTestId('location')).toHaveTextContent('/profile/lists');
  });

  it('opens the Favorites tab from the menu', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(user)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Favorites'));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/profile/favorites'
    );
  });
});

const Jump = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <span data-testid="path">{pathname}</span>
      <button
        onClick={() =>
          void navigate('/', { state: { loginReturnTo: '/profile' } })
        }
      >
        jump
      </button>
    </>
  );
};

describe('AppHeader returning a Guest after Log in', () => {
  // The session query reads a Guest as `null`; the API type has no such case.
  beforeEach(() => mockedAuth.me.mockResolvedValue(null as never));

  const renderJumped = async () => {
    const result = renderWithProviders(
      <>
        <AppHeader />
        <Jump />
      </>,
      { route: '/profile' }
    );
    await userEvent.click(screen.getByRole('button', { name: 'jump' }));
    return result;
  };

  it('opens Log in when the guard sends a Guest home', async () => {
    await renderJumped();
    expect(
      await screen.findByRole('dialog', { name: 'Log in' })
    ).toBeInTheDocument();
  });

  it('goes to the page asked for once signed in', async () => {
    const { queryClient } = await renderJumped();
    await screen.findByRole('dialog', { name: 'Log in' });
    act(() => {
      queryClient.setQueryData(queryKeys.session, user);
    });
    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent('/profile')
    );
  });

  it('forgets the page once Log in is closed without signing in', async () => {
    const { queryClient } = await renderJumped();
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    act(() => {
      queryClient.setQueryData(queryKeys.session, user);
    });
    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/)
    );
  });
});

describe('AppHeader theme button', () => {
  it('toggles the theme and names what it will do next', async () => {
    const { store } = await renderHeader(<AppHeader />, withSession(null));

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to dark theme' })
    );

    expect(store.getState().devicePreferences.theme).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Switch to light theme' })
    ).toBeInTheDocument();
  });
});

describe('AppHeader notification stream', () => {
  const pushed: CreditNotification = {
    id: 5,
    kind: 'co_author_added',
    work: { type: 'book', id: 7, title: 'The Glass Harbour' },
    actor: { kind: 'co_author', name: 'Margaret Hale' },
    readAt: null,
    createdAt: '2026-09-26T10:00:00.000Z',
  };

  it('opens no stream for a Guest', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('closes the stream on Log out', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    await renderHeader(<AppHeader />, withSession(user));
    const source = FakeEventSource.latest();

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Log out'));

    await screen.findByRole('menuitem', { name: 'Log in' });
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('signs the page out when the stream is refused and the session has ended', async () => {
    mockedAuth.me.mockRejectedValue(
      new ApiError(401, 'Authentication required')
    );
    await renderHeader(<AppHeader />, withSession(user));
    const source = FakeEventSource.latest();

    act(() => {
      source.fail(FakeEventSource.CLOSED);
    });

    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
  });

  it('drops the last account’s stream and toasts when another account signs in', async () => {
    const { queryClient } = await renderHeader(
      <AppHeader />,
      withSession(user)
    );
    const first = FakeEventSource.latest();
    act(() => {
      first.emit(NOTIFICATION_STREAM_EVENT, pushed);
    });
    expect(
      await screen.findByRole('button', { name: 'Open' })
    ).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(queryKeys.session, {
        ...user,
        id: 2,
        login: 'eve',
      });
    });

    await screen.findByText('eve');
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.latest()).not.toBe(first);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    );
  });
});
