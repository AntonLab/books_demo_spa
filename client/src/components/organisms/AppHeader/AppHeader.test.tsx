import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { AppHeader } from './AppHeader';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import * as notificationsApi from '@/api/notifications';
import * as genresApi from '@/api/genres';
import type { PublicUser } from '@/types/api';
import type { RootState } from '@/store';

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
    items: [
      { id: 3, name: 'Gothic' },
      { id: 4, name: 'Hard SF' },
    ],
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
    mockedAuth.me.mockReturnValue(new Promise<PublicUser>(() => {}));

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

  it('hides My Books', async () => {
    await renderHeader(<AppHeader />, withSession(null));

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
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
    // unambiguous query here.
    const { container } = await renderHeader(
      <AppHeader />,
      withSession({ ...user, avatarUrl: '/api/users/1/avatar?v=1' })
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/users/1/avatar?v=1'
    );
  });

  it('shows My Books to an author', async () => {
    await renderHeader(<AppHeader />, withSession({ ...user, role: 'author' }));

    expect(
      screen.getByRole('menuitem', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('hides My Books from a reader, who has no books to keep', async () => {
    await renderHeader(<AppHeader />, withSession(user));

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
  });

  it('logs out through the dropdown', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const { queryClient } = await renderHeader(
      <AppHeader />,
      withSession(user)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Log out'));

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
    });
    expect(mockedAuth.logout).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
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

  it('offers Manage genres to an admin, after Profile', async () => {
    await renderHeader(<AppHeader />, withSession(admin));

    await userEvent.click(screen.getByText('bob'));
    await screen.findByText('Manage genres');

    // Scoped to the account dropdown's own popup — its rendered class, not
    // an index or the nav menu on the left, which is also role="menu" — so
    // this pins Manage genres landing right after Profile rather than merely
    // existing somewhere in the menu.
    const dropdown = document.querySelector<HTMLElement>('.ant-dropdown-menu');
    if (!dropdown) {
      throw new Error('account dropdown popup not found');
    }
    const items = within(dropdown).getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Profile',
      'Manage genres',
      'Log out',
    ]);
  });

  it('offers Manage genres to a superadmin', async () => {
    await renderHeader(
      <AppHeader />,
      withSession({ ...user, role: 'superadmin' })
    );

    await userEvent.click(screen.getByText('bob'));

    expect(await screen.findByText('Manage genres')).toBeInTheDocument();
  });

  it('hides Manage genres from every other role', async () => {
    await renderHeader(<AppHeader />, withSession({ ...user, role: 'author' }));

    await userEvent.click(screen.getByText('bob'));

    // Profile is there, so the menu really did open before this claim.
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.queryByText('Manage genres')).toBeNull();
  });

  it('navigates to the management page when Manage genres is clicked', async () => {
    await renderHeader(
      <>
        <AppHeader />
        <LocationProbe />
      </>,
      withSession(admin)
    );

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Manage genres'));

    expect(screen.getByTestId('location')).toHaveTextContent('/admin/genres');
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

describe('AppHeader and Unsaved text', () => {
  const entries = {
    'book:1:comment': {
      text: 'Half a thought',
      savedAt: '2026-09-23T10:00:00.000Z',
    },
  };
  const ownedBy = (accountId: number): Partial<RootState> => ({
    unsavedText: { accountId, entries },
  });

  it('discards every entry on Log out', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const { store } = await renderHeader(<AppHeader />, {
      ...withSession(user),
      preloadedState: ownedBy(1),
    });

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Log out'));

    await waitFor(() => {
      expect(store.getState().unsavedText).toEqual({
        accountId: null,
        entries: {},
      });
    });
  });

  it('discards every entry when another Account is signed in', async () => {
    const { store } = await renderHeader(<AppHeader />, {
      ...withSession(user),
      preloadedState: ownedBy(2),
    });

    await waitFor(() => {
      expect(store.getState().unsavedText).toEqual({
        accountId: 1,
        entries: {},
      });
    });
  });

  it('keeps the entries when the session is lost without Log out', async () => {
    const { store, queryClient } = await renderHeader(<AppHeader />, {
      ...withSession(user),
      preloadedState: ownedBy(1),
    });

    // An expiry, a Block or a password reset: the session just becomes null.
    act(() => {
      queryClient.setQueryData(queryKeys.session, null);
    });

    expect(
      await screen.findByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
    expect(store.getState().unsavedText).toEqual({ accountId: 1, entries });
  });
});
