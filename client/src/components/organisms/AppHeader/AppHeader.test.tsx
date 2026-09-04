import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from './AppHeader';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);

const user: PublicUser = {
  id: 1,
  login: 'bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobson',
  status: 'active',
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
});

describe('AppHeader while the session is loading', () => {
  it('shows neither Log in nor an avatar', () => {
    // Never resolves, so the query stays pending for the assertion.
    mockedAuth.me.mockReturnValue(new Promise<PublicUser>(() => {}));

    renderWithProviders(<AppHeader />);

    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
    expect(screen.queryByText('bob')).toBeNull();
  });
});

describe('AppHeader when logged out', () => {
  it('offers Log in and Register', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Register' })
    ).toBeInTheDocument();
  });

  it('hides My Books', () => {
    renderWithProviders(<AppHeader />, withSession(null));

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
  });

  it('opens the login modal in the store when Log in is clicked', async () => {
    const { store } = renderWithProviders(<AppHeader />, withSession(null));

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(store.getState().auth.activeModal).toBe('login');
  });

  it('opens the register modal when Register is clicked', async () => {
    const { store } = renderWithProviders(<AppHeader />, withSession(null));

    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(store.getState().auth.activeModal).toBe('register');
  });
});

describe('AppHeader when logged in', () => {
  it('shows the login name instead of the auth buttons', () => {
    renderWithProviders(<AppHeader />, withSession(user));

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
  });

  it('shows My Books', () => {
    renderWithProviders(<AppHeader />, withSession(user));

    expect(
      screen.getByRole('menuitem', { name: 'My Books' })
    ).toBeInTheDocument();
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
      await screen.findByRole('button', { name: 'Log in' })
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
