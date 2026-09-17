import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePage } from './ProfilePage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import * as usersApi from '@/api/users';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/auth');
jest.mock('@/api/users');
const mockedAuth = jest.mocked(authApi);
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
const renderWithSession = (data: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, data);
  return renderWithProviders(<ProfilePage />, { queryClient });
};

beforeEach(() => {
  jest.resetAllMocks();
  // A default so that a successful mutation's session invalidation (K3) has
  // something real to refetch; the "while loading" test below overrides this
  // with a promise that never resolves.
  mockedAuth.me.mockResolvedValue(session);
});

describe('ProfilePage while the session is loading', () => {
  it('shows only the heading', () => {
    // Never resolves, so the session query stays pending for the assertion.
    mockedAuth.me.mockReturnValue(new Promise<PublicUser>(() => {}));

    renderWithProviders(<ProfilePage />);

    expect(
      screen.getByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Log in to see your profile.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload avatar' })).toBeNull();
  });
});

describe('ProfilePage when the session fails to load', () => {
  it('shows an error instead of the profile', async () => {
    // Not a 401: that one is the ordinary "nobody is signed in" case, which
    // the query itself turns into a `null` success (see queries/auth.ts).
    // The test query client already sets `retry: false`, so this surfaces
    // as `isError` on the first attempt with no backoff delay.
    mockedAuth.me.mockRejectedValue(new ApiError(500, 'Server error'));

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByText('Could not load your profile.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Log in to see your profile.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload avatar' })).toBeNull();
  });
});

describe('ProfilePage, signed out', () => {
  it('asks the visitor to log in', () => {
    renderWithSession(null);

    expect(screen.getByText('Log in to see your profile.')).toBeInTheDocument();
  });
});

describe('ProfilePage, signed in', () => {
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
