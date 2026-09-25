import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginModal } from './LoginModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { queryKeys } from '@/queries/keys';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);
const onOpen = jest.fn();
const onClose = jest.fn();

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

beforeEach(() => {
  jest.resetAllMocks();
});

describe('LoginModal', () => {
  it('requires both fields before submitting', async () => {
    renderWithProviders(<LoginModal onOpen={onOpen} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your login')).toBeInTheDocument();
    expect(await screen.findByText('Enter your password')).toBeInTheDocument();
    expect(mockedAuth.login).not.toHaveBeenCalled();
  });

  it('submits the credentials, caches the user and closes the modal', async () => {
    mockedAuth.login.mockResolvedValue(user);
    const { queryClient } = renderWithProviders(
      <LoginModal onOpen={onOpen} onClose={onClose} />
    );

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
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the server message at form level on a 401', async () => {
    mockedAuth.login.mockRejectedValue(
      new ApiError(401, 'Invalid credentials')
    );
    renderWithProviders(<LoginModal onOpen={onOpen} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Login'), 'bob');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid credentials'
    );
  });

  it('shows the blocked-account message on a 403', async () => {
    mockedAuth.login.mockRejectedValue(new ApiError(403, 'Account is blocked'));
    renderWithProviders(<LoginModal onOpen={onOpen} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Login'), 'bob');
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account is blocked'
    );
  });

  it('switches to the reset-request modal from the forgot-password link', async () => {
    renderWithProviders(<LoginModal onOpen={onOpen} onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Forgot password?' })
    );

    expect(onOpen).toHaveBeenCalledWith('resetRequest');
  });

  it('switches to the register modal', async () => {
    renderWithProviders(<LoginModal onOpen={onOpen} onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Create an account' })
    );

    expect(onOpen).toHaveBeenCalledWith('register');
  });
});
