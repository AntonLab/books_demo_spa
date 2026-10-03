import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordForm } from './ChangePasswordForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as usersApi from '@/api/users';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/users');
const mockedUsers = jest.mocked(usersApi);

const session: PublicUser = {
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderForm = () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  renderWithProviders(<ChangePasswordForm userId={1} />, { queryClient });
  return queryClient;
};

const submitValid = async (
  user: ReturnType<typeof userEvent.setup>,
  confirm = 'new-secret1'
) => {
  await user.type(screen.getByLabelText('Current password'), 'old-secret1');
  await user.type(screen.getByLabelText('New password'), 'new-secret1');
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ChangePasswordForm', () => {
  it('sends password and currentPassword, shows the message and clears the session', async () => {
    mockedUsers.updateUser.mockResolvedValue(session);
    const user = userEvent.setup();
    const queryClient = renderForm();

    await submitValid(user);

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledWith(1, {
        password: 'new-secret1',
        currentPassword: 'old-secret1',
      })
    );
    expect(
      await screen.findByText(
        'Password changed. Sign in with your new password.'
      )
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
  });

  it('does not send the confirm field', async () => {
    mockedUsers.updateUser.mockResolvedValue(session);
    const user = userEvent.setup();
    renderForm();

    await submitValid(user);

    await waitFor(() => expect(mockedUsers.updateUser).toHaveBeenCalled());
    const [, body] = mockedUsers.updateUser.mock.calls[0] ?? [];
    expect(Object.keys(body ?? {}).sort()).toEqual([
      'currentPassword',
      'password',
    ]);
  });

  it('keeps the session and shows the field error on a wrong current password', async () => {
    mockedUsers.updateUser.mockRejectedValue(
      new ApiError(403, 'Current password is incorrect')
    );
    const user = userEvent.setup();
    const queryClient = renderForm();

    await submitValid(user);

    expect(
      await screen.findByText('Current password is incorrect')
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.session)).toEqual(session);
    expect(
      screen.queryByText('Password changed. Sign in with your new password.')
    ).toBeNull();
  });

  it('clears New password and Confirm password after a 403 and keeps Current password', async () => {
    mockedUsers.updateUser.mockRejectedValue(
      new ApiError(403, 'Current password is incorrect')
    );
    const user = userEvent.setup();
    renderForm();

    await submitValid(user);

    await screen.findByText('Current password is incorrect');
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
    expect(screen.getByLabelText('Current password')).toHaveValue(
      'old-secret1'
    );
  });

  it('shows any other error in an Alert and keeps the session', async () => {
    mockedUsers.updateUser.mockRejectedValue(
      new ApiError(400, 'Something went wrong')
    );
    const user = userEvent.setup();
    const queryClient = renderForm();

    await submitValid(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong'
    );
    expect(queryClient.getQueryData(queryKeys.session)).toEqual(session);
  });

  it('refuses mismatched confirmation without calling the api', async () => {
    const user = userEvent.setup();
    renderForm();

    await submitValid(user, 'different-1');

    expect(
      await screen.findByText('The two passwords do not match')
    ).toBeInTheDocument();
    expect(mockedUsers.updateUser).not.toHaveBeenCalled();
  });
});
