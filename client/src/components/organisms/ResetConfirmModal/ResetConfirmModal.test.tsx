import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { ResetConfirmModal } from './ResetConfirmModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);

const signedInUser: PublicUser = {
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

const withSession = (user: PublicUser | null = null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, user);
  return { queryClient };
};

beforeEach(() => {
  jest.resetAllMocks();
});

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

describe('ResetConfirmModal', () => {
  // The token in the URL is what keeps the modal open, so leaving the page is
  // how it closes.
  it('leaves the reset link for the home page when dismissed', async () => {
    renderWithProviders(
      <>
        <ResetConfirmModal token="tok-123" />
        <LocationProbe />
      </>,
      { ...withSession(), route: '/reset-password?token=tok-123' }
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('rejects a password shorter than 8 characters', async () => {
    renderWithProviders(<ResetConfirmModal token="tok-123" />, withSession());

    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' })
    );

    expect(
      await screen.findByText('Password must be 8 to 128 characters')
    ).toBeInTheDocument();
    expect(mockedAuth.confirmReset).not.toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation', async () => {
    renderWithProviders(<ResetConfirmModal token="tok-123" />, withSession());

    await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'newsecret2'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' })
    );

    expect(
      await screen.findByText('The two passwords do not match')
    ).toBeInTheDocument();
  });

  it('sends the token it was given with the new password', async () => {
    mockedAuth.confirmReset.mockResolvedValue(undefined);
    renderWithProviders(<ResetConfirmModal token="tok-123" />, withSession());

    await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'newsecret1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' })
    );

    await waitFor(() => {
      expect(mockedAuth.confirmReset).toHaveBeenCalledWith(
        'tok-123',
        'newsecret1'
      );
    });
    // The confirmation field is never part of the request.
    expect(mockedAuth.confirmReset).toHaveBeenCalledTimes(1);
  });

  it('shows one message for an expired, unknown or used token', async () => {
    mockedAuth.confirmReset.mockRejectedValue(
      new ApiError(400, 'Reset token is invalid or has expired')
    );
    renderWithProviders(<ResetConfirmModal token="stale" />, withSession());

    await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'newsecret1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reset token is invalid or has expired'
    );
  });

  it('signs the client out on a successful reset, since the server kills every session including this one', async () => {
    mockedAuth.confirmReset.mockResolvedValue(undefined);
    const { queryClient } = renderWithProviders(
      <ResetConfirmModal token="tok-123" />,
      withSession(signedInUser)
    );

    expect(queryClient.getQueryData(queryKeys.session)).toEqual(signedInUser);

    await userEvent.type(screen.getByLabelText('New password'), 'newsecret1');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'newsecret1'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' })
    );

    expect(
      await screen.findByText('Your password has been reset.')
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKeys.session)).toBeNull();
  });
});
