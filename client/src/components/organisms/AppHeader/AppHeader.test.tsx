import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from './AppHeader';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import * as notificationsApi from '@/api/notifications';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/auth');
jest.mock('@/api/notifications');

const mockedAuth = jest.mocked(authApi);
const mockedNotifications = jest.mocked(notificationsApi);

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
});

describe('AppHeader while the session is loading', () => {
  it('shows neither Log in nor an avatar', () => {
    // Never resolves, so the query stays pending for the assertion.
    mockedAuth.me.mockReturnValue(new Promise<PublicUser>(() => {}));

    renderWithProviders(<AppHeader />);

    expect(screen.queryByRole('menuitem', { name: 'Log in' })).toBeNull();
    expect(screen.queryByText('bob')).toBeNull();
  });
});

describe('AppHeader navigation', () => {
  it('has no Series item, since there is no series page to go to', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(screen.getByRole('menuitem', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Series' })).toBeNull();
  });
});

describe('AppHeader when logged out', () => {
  it('offers Log in as a menu item, and no Register', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(
      screen.getByRole('menuitem', { name: 'Log in' })
    ).toBeInTheDocument();
    // Registration stays one click further on, through the login modal's
    // "Create an account".
    expect(screen.queryByText('Register')).toBeNull();
  });

  it('hides My Books', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
  });

  it('has no notifications to show and asks for none', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(screen.queryByRole('button', { name: /^Notifications/ })).toBeNull();
    expect(mockedNotifications.listNotifications).not.toHaveBeenCalled();
  });

  it('opens the login modal in the store when Log in is clicked', async () => {
    const { store } = renderWithProviders(<AppHeader />, withSession(null));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Log in' }));

    expect(store.getState().auth.activeModal).toBe('login');
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
    renderWithProviders(<AppHeader />, withSession(user));

    expect(
      await screen.findByRole('button', { name: 'Notifications, 4 unread' })
    ).toBeInTheDocument();
  });

  it('shows the login name instead of Log in', () => {
    renderWithProviders(<AppHeader />, withSession(user));

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Log in' })).toBeNull();
  });

  it('shows the avatar image once the account has one', () => {
    // Not getByRole('img'): antd's Input.Search and Menu render their own
    // icons as SVGs with role="img", so an actual <img> tag is the
    // unambiguous query here.
    const { container } = renderWithProviders(
      <AppHeader />,
      withSession({ ...user, avatarUrl: '/api/users/1/avatar?v=1' })
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/users/1/avatar?v=1'
    );
  });

  it('shows My Books to an author', () => {
    renderWithProviders(
      <AppHeader />,
      withSession({ ...user, role: 'author' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('hides My Books from a reader, who has no books to keep', () => {
    renderWithProviders(<AppHeader />, withSession(user));

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
  });

  it('logs out through the dropdown', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const { queryClient } = renderWithProviders(
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
    renderWithProviders(<AppHeader />, withSession(user));

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
