import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginModal } from './LoginModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { createAppStore } from '@/store';
import { openModal } from '@/store/authSlice';
import { queryKeys } from '@/queries/keys';
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

beforeEach(() => {
  jest.resetAllMocks();
});

describe('LoginModal', () => {
  it('requires both fields before submitting', async () => {
    renderWithProviders(<LoginModal />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your login')).toBeInTheDocument();
    expect(await screen.findByText('Enter your password')).toBeInTheDocument();
    expect(mockedAuth.login).not.toHaveBeenCalled();
  });

  it('submits the credentials, caches the user and closes the modal', async () => {
    mockedAuth.login.mockResolvedValue(user);
    const store = createAppStore();
    store.dispatch(openModal('login'));
    const { queryClient } = renderWithProviders(<LoginModal />, { store });

    await userEvent.type(screen.getByLabelText('Login'), 'bob');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.session)).toEqual(user);
    });
    expect(mockedAuth.login).toHaveBeenCalledWith({
      login: 'bob',
      password: 'secret123',
    });
    // The reducer used to do this; the component does it now, so it is worth
    // its own assertion.
    expect(store.getState().auth.activeModal).toBeNull();
  });

  it('shows the server message at form level on a 401', async () => {
    mockedAuth.login.mockRejectedValue(
      new ApiError(401, 'Invalid credentials')
    );
    renderWithProviders(<LoginModal />);

    await userEvent.type(screen.getByLabelText('Login'), 'bob');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid credentials'
    );
  });

  it('shows the blocked-account message on a 403', async () => {
    mockedAuth.login.mockRejectedValue(new ApiError(403, 'Account is blocked'));
    renderWithProviders(<LoginModal />);

    await userEvent.type(screen.getByLabelText('Login'), 'bob');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account is blocked'
    );
  });

  it('switches to the reset-request modal from the forgot-password link', async () => {
    const { store } = renderWithProviders(<LoginModal />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Forgot password?' })
    );

    expect(store.getState().auth.activeModal).toBe('resetRequest');
  });

  it('switches to the register modal', async () => {
    const { store } = renderWithProviders(<LoginModal />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Create an account' })
    );

    expect(store.getState().auth.activeModal).toBe('register');
  });
});
