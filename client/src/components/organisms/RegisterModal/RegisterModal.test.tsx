import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterModal } from './RegisterModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import { createAppStore } from '@/store';
import { openModal } from '@/store/authSlice';
import { queryKeys } from '@/queries/keys';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/auth');

const mockedAuth = jest.mocked(authApi);

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

const fillInTheForm = async (): Promise<void> => {
  await userEvent.type(screen.getByLabelText('Login'), 'bob');
  await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com');
  await userEvent.type(screen.getByLabelText('First name'), 'Bob');
  await userEvent.type(screen.getByLabelText('Last name'), 'Bobson');
  await userEvent.type(screen.getByLabelText('Password'), 'secret123');
  await userEvent.type(screen.getByLabelText('Confirm password'), 'secret123');
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('RegisterModal validation', () => {
  it('rejects a login shorter than the server minimum of 3', async () => {
    renderWithProviders(<RegisterModal />);

    await userEvent.type(screen.getByLabelText('Login'), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('Login must be 3 to 64 characters')
    ).toBeInTheDocument();
    expect(mockedAuth.register).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than the server minimum of 8', async () => {
    renderWithProviders(<RegisterModal />);

    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('Password must be 8 to 128 characters')
    ).toBeInTheDocument();
  });

  it('rejects a mismatched confirmation', async () => {
    renderWithProviders(<RegisterModal />);

    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    await userEvent.type(
      screen.getByLabelText('Confirm password'),
      'secret124'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('The two passwords do not match')
    ).toBeInTheDocument();
  });
});

describe('RegisterModal submission', () => {
  it('sends every server field and never sends confirm', async () => {
    mockedAuth.register.mockResolvedValue(user);
    renderWithProviders(<RegisterModal />);

    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(mockedAuth.register).toHaveBeenCalledTimes(1);
    });
    expect(mockedAuth.register).toHaveBeenCalledWith({
      login: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      firstName: 'Bob',
      lastName: 'Bobson',
      role: 'user',
    });
    // The server has no `confirm` field; zod would strip it silently.
    const sent = mockedAuth.register.mock.calls[0]![0];
    expect(sent).not.toHaveProperty('confirm');
  });

  it('caches the user and closes the modal on success', async () => {
    mockedAuth.register.mockResolvedValue(user);
    const store = createAppStore();
    store.dispatch(openModal('register'));
    const { queryClient } = renderWithProviders(<RegisterModal />, { store });

    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.session)).toEqual(user);
    });
    expect(store.getState().auth.activeModal).toBeNull();
  });

  it('registers as a plain user when the box is left alone', async () => {
    mockedAuth.register.mockResolvedValue(user);

    renderWithProviders(<RegisterModal />);
    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    // antd validates asynchronously, so the submit lands some ticks after the
    // click; wait for it rather than relying on the click's tick to flush it.
    await waitFor(() => {
      expect(mockedAuth.register).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' })
      );
    });
  });

  it('registers as an author when the box is ticked', async () => {
    mockedAuth.register.mockResolvedValue({ ...user, role: 'author' });

    renderWithProviders(<RegisterModal />);
    await fillInTheForm();
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm author" }));
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(mockedAuth.register).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'author' })
      );
    });
  });
});

describe('RegisterModal conflict handling', () => {
  it('puts a login conflict beneath the Login field', async () => {
    mockedAuth.register.mockRejectedValue(
      new ApiError(409, 'login is already taken', { field: 'login' })
    );
    renderWithProviders(<RegisterModal />);

    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('login is already taken')
    ).toBeInTheDocument();
    // Field-level, not a banner.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts an email conflict beneath the Email field', async () => {
    mockedAuth.register.mockRejectedValue(
      new ApiError(409, 'email is already taken', { field: 'email' })
    );
    renderWithProviders(<RegisterModal />);

    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByText('email is already taken')
    ).toBeInTheDocument();
  });

  it('falls back to a form-level alert for a non-conflict failure', async () => {
    mockedAuth.register.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );
    renderWithProviders(<RegisterModal />);

    await fillInTheForm();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Internal Server Error'
    );
  });
});
