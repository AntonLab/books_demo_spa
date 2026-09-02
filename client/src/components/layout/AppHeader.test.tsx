import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from './AppHeader';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as authApi from '../../api/auth';
import type { PublicUser } from '../../types/user';
import type { RootState } from '../../store';

jest.mock('../../api/auth');

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

function authState(overrides: Partial<RootState['auth']>): Partial<RootState> {
  return {
    auth: {
      user: null,
      status: 'ready',
      error: null,
      activeModal: null,
      resetToken: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('AppHeader while the session is loading', () => {
  it('shows neither Log in nor an avatar', () => {
    renderWithProviders(<AppHeader />, {
      preloadedState: authState({ status: 'loading' }),
    });

    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
    expect(screen.queryByText('bob')).toBeNull();
  });
});

describe('AppHeader when logged out', () => {
  it('offers Log in and Register', () => {
    renderWithProviders(<AppHeader />, { preloadedState: authState({}) });

    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Register' })
    ).toBeInTheDocument();
  });

  it('hides My Books', () => {
    renderWithProviders(<AppHeader />, { preloadedState: authState({}) });

    expect(screen.queryByRole('menuitem', { name: 'My Books' })).toBeNull();
  });

  it('opens the login modal in the store when Log in is clicked', async () => {
    const { store } = renderWithProviders(<AppHeader />, {
      preloadedState: authState({}),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(store.getState().auth.activeModal).toBe('login');
  });

  it('opens the register modal when Register is clicked', async () => {
    const { store } = renderWithProviders(<AppHeader />, {
      preloadedState: authState({}),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(store.getState().auth.activeModal).toBe('register');
  });
});

describe('AppHeader when logged in', () => {
  it('shows the login name instead of the auth buttons', () => {
    renderWithProviders(<AppHeader />, { preloadedState: authState({ user }) });

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull();
  });

  it('shows My Books', () => {
    renderWithProviders(<AppHeader />, { preloadedState: authState({ user }) });

    expect(
      screen.getByRole('menuitem', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('logs out through the dropdown', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const { store } = renderWithProviders(<AppHeader />, {
      preloadedState: authState({ user }),
    });

    await userEvent.click(screen.getByText('bob'));
    await userEvent.click(await screen.findByText('Log out'));

    await waitFor(() => {
      expect(store.getState().auth.user).toBeNull();
    });
    expect(mockedAuth.logout).toHaveBeenCalledTimes(1);
  });
});
