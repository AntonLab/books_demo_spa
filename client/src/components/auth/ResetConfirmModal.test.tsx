import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetConfirmModal } from './ResetConfirmModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import type { RootState } from '../../store';

jest.mock('../../api/auth');

const mockedAuth = jest.mocked(authApi);

function withToken(token: string | null): Partial<RootState> {
  return {
    auth: {
      user: null,
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
});
