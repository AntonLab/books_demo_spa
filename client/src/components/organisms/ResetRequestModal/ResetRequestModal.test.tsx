import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetRequestModal } from './ResetRequestModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);
const onOpen = jest.fn();
const onClose = jest.fn();

const CONFIRMATION =
  'If that email address has an account, a reset link is on its way.';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ResetRequestModal', () => {
  it('requires a valid email address', async () => {
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    expect(
      await screen.findByText('Enter a valid email address')
    ).toBeInTheDocument();
    expect(mockedAuth.requestReset).not.toHaveBeenCalled();
  });

  it('sends the address and shows the confirmation', async () => {
    mockedAuth.requestReset.mockResolvedValue(undefined);
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
    expect(mockedAuth.requestReset).toHaveBeenCalledWith('bob@example.com');
  });

  it('shows the same confirmation for an address with no account', async () => {
    // The server answers 202 either way; the UI must not differ, or it becomes
    // the account-enumeration oracle the server refuses to be.
    mockedAuth.requestReset.mockResolvedValue(undefined);
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    expect(await screen.findByText(CONFIRMATION)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the form once the confirmation is shown', async () => {
    mockedAuth.requestReset.mockResolvedValue(undefined);
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    await screen.findByText(CONFIRMATION);
    await waitFor(() => {
      expect(screen.queryByLabelText('Email')).toBeNull();
    });
  });

  it('goes back to the login modal', async () => {
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Back to log in' })
    );

    expect(onOpen).toHaveBeenCalledWith('login');
  });
});
