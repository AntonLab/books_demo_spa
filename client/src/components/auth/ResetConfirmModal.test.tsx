import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetConfirmModal } from './ResetConfirmModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import type { RootState } from '../../store';
import type { PublicUser } from '../../types/user';

jest.mock('../../api/auth');

const mockedAuth = jest.mocked(authApi);

const signedInUser: PublicUser = {
  id: 1,
  login: 'bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobson',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function withToken(
  token: string | null,
  user: PublicUser | null = null
): Partial<RootState> {
  return {
    auth: {
      user,
      status: 'ready',
      error: null,
      activeModal: 'resetConfirm',
      resetToken: token,
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ResetConfirmModal', () => {
  it('rejects a password shorter than 8 characters', async () => {
    renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken('tok-123'),
    });

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
    renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken('tok-123'),
    });

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

  it('sends the token from the store with the new password', async () => {
    mockedAuth.confirmReset.mockResolvedValue(undefined);
    renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken('tok-123'),
    });

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
    renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken('stale'),
    });

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

  it('explains rather than submitting when the link carried no token', async () => {
    renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken(null),
    });

    expect(
      await screen.findByText('This reset link is missing its token.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('signs the client out on a successful reset, since the server kills every session including this one', async () => {
    mockedAuth.confirmReset.mockResolvedValue(undefined);
    const { store } = renderWithProviders(<ResetConfirmModal />, {
      preloadedState: withToken('tok-123', signedInUser),
    });

    expect(store.getState().auth.user).toEqual(signedInUser);

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
    expect(store.getState().auth.user).toBeNull();
  });
});
