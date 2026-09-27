import { screen } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import * as notificationsApi from '@/api/notifications';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');
jest.mock('@/api/notifications');
const mockedAuth = jest.mocked(authApi);
const mockedNotifications = jest.mocked(notificationsApi);

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
  mockedAuth.me.mockResolvedValue(session);
  mockedNotifications.getNotificationSettings.mockResolvedValue({
    emailNotifications: true,
  });
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

  it('offers no email switch to a Guest and asks for no settings', () => {
    renderWithSession(null);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockedNotifications.getNotificationSettings).not.toHaveBeenCalled();
  });
});

describe('ProfilePage, signed in', () => {
  it('renders the account settings', () => {
    renderWithSession(session);

    expect(
      screen.getByRole('button', { name: 'Upload avatar' })
    ).toBeInTheDocument();
  });
});
