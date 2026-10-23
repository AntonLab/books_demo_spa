import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EMAIL_MAX_LENGTH } from 'shared';
import { ResetRequestModal } from './ResetRequestModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);
const onOpen = jest.fn();
const onClose = jest.fn();

const CONFIRMATION =
  'If that email address has an account, a reset link is on its way.';
const TOO_LONG = `Email must be at most ${EMAIL_MAX_LENGTH} characters`;

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

  it('rejects an email one character past the limit', async () => {
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );
    const email = 'a'.repeat(EMAIL_MAX_LENGTH - '@x.io'.length + 1) + '@x.io';

    await userEvent.click(screen.getByLabelText('Email'));
    await userEvent.paste(email);
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(mockedAuth.requestReset).not.toHaveBeenCalled();
  });

  it('does not show the length message for an email of exactly the limit', async () => {
    mockedAuth.requestReset.mockResolvedValue(undefined);
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );
    const email = 'a'.repeat(EMAIL_MAX_LENGTH - '@x.io'.length) + '@x.io';

    await userEvent.click(screen.getByLabelText('Email'));
    await userEvent.paste(email);
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );

    await waitFor(() => expect(mockedAuth.requestReset).toHaveBeenCalled());
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
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

  it('closes at once when nothing was typed', async () => {
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding typed input, and closes on confirm', async () => {
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'bob');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findAllByText('Discard changes?')).not.toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without asking once the reset link was sent', async () => {
    mockedAuth.requestReset.mockResolvedValue(undefined);
    renderWithProviders(
      <ResetRequestModal onOpen={onOpen} onClose={onClose} />
    );

    await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' })
    );
    await screen.findByText(CONFIRMATION);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
