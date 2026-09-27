import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSettings } from './ProfileSettings';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import * as notificationsApi from '@/api/notifications';
import * as usersApi from '@/api/users';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');
jest.mock('@/api/notifications');
jest.mock('@/api/users');
const mockedAuth = jest.mocked(authApi);
const mockedNotifications = jest.mocked(notificationsApi);
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Seeds the session cache directly, so a test settles without waiting on
// GET /me.
const renderWithSession = (data: PublicUser) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, data);
  return renderWithProviders(<ProfileSettings />, { queryClient });
};

beforeEach(() => {
  jest.resetAllMocks();
  // A default so that a successful mutation's session invalidation (K3) has
  // something real to refetch.
  mockedAuth.me.mockResolvedValue(session);
  mockedNotifications.getNotificationSettings.mockResolvedValue({
    emailNotifications: true,
  });
});

describe('ProfileSettings', () => {
  it('offers the email switch', async () => {
    renderWithSession(session);

    expect(
      await screen.findByRole('switch', { name: 'Email notifications' })
    ).toBeInTheDocument();
  });

  it('shows the account avatar and an upload control', () => {
    renderWithSession(session);

    expect(
      screen.getByRole('button', { name: 'Upload avatar' })
    ).toBeInTheDocument();
  });

  it('has no Remove button while there is no avatar', () => {
    renderWithSession(session);

    expect(screen.queryByRole('button', { name: 'Remove avatar' })).toBeNull();
  });

  it('offers Remove behind a confirm once an avatar exists', () => {
    renderWithSession({ ...session, avatarUrl: '/api/users/1/avatar?v=1' });

    expect(
      screen.getByRole('button', { name: 'Remove avatar' })
    ).toBeInTheDocument();
  });

  it('uploads the picked file', async () => {
    mockedUsers.uploadAvatar.mockResolvedValue({
      ...session,
      avatarUrl: '/api/users/1/avatar?v=2',
    });
    renderWithSession(session);
    const file = new File([new Uint8Array([1, 2, 3])], 'me.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(mockedUsers.uploadAvatar).toHaveBeenCalledWith(1, file);
  });

  it('rejects an unaccepted file type before calling the API', async () => {
    // user-event v14 applies the input's `accept` attribute by default, which
    // would silently drop the .gif before it ever reached the precheck.
    const user = userEvent.setup({ applyAccept: false });
    renderWithSession(session);
    const file = new File([new Uint8Array([1])], 'me.gif', {
      type: 'image/gif',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    expect(mockedUsers.uploadAvatar).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();
  });

  it('rejects an oversized file before calling the API', async () => {
    renderWithSession(session);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, big);

    expect(mockedUsers.uploadAvatar).not.toHaveBeenCalled();
    expect(
      screen.getByText('Images must be 2 MiB or smaller.')
    ).toBeInTheDocument();
  });

  it('shows the server error on a failed upload', async () => {
    mockedUsers.uploadAvatar.mockRejectedValue(new Error('Not a valid image'));
    renderWithSession(session);
    const file = new File([new Uint8Array([1])], 'me.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(await screen.findByText('Not a valid image')).toBeInTheDocument();
  });

  it('removes the avatar on confirm', async () => {
    mockedUsers.deleteAvatar.mockResolvedValue(undefined);
    renderWithSession({ ...session, avatarUrl: '/api/users/1/avatar?v=1' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove avatar' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(mockedUsers.deleteAvatar).toHaveBeenCalledWith(1);
  });

  it('shows the server error on a failed remove', async () => {
    mockedUsers.deleteAvatar.mockRejectedValue(
      new Error('Could not remove the avatar')
    );
    renderWithSession({ ...session, avatarUrl: '/api/users/1/avatar?v=1' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove avatar' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText('Could not remove the avatar')
    ).toBeInTheDocument();
  });
});
