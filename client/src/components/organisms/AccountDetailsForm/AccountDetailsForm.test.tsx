import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ABOUT_MAX_LENGTH, LOGIN_MAX_LENGTH } from 'shared';
import { AccountDetailsForm } from './AccountDetailsForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { sessionOf } from '@/test/session';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as authApi from '@/api/auth';
import * as usersApi from '@/api/users';
import type { PublicUser } from '@/types/api';

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
  about: '',
  showLastSeen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderForm = () => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<AccountDetailsForm user={session} />, {
    queryClient,
  });
};

const field = (name: string) => screen.getByRole('textbox', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save' });

const replaceText = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  text: string
) => {
  await user.clear(field(name));
  await user.type(field(name), text);
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedAuth.me.mockResolvedValue(sessionOf(session));
});

describe('AccountDetailsForm', () => {
  const aboutField = () => screen.getByRole('textbox', { name: 'About' });
  const lastSeenBox = () =>
    screen.getByRole('checkbox', { name: 'Show when I was last online' });

  it('prefills About and the last-online box and keeps Save disabled', () => {
    renderForm();
    expect(aboutField()).toHaveValue('');
    expect(lastSeenBox()).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it('sends only About when only About changed, line breaks kept', async () => {
    mockedUsers.updateUser.mockResolvedValue({
      ...session,
      about: 'Hi\nthere',
    });
    const user = userEvent.setup();
    renderForm();

    await user.type(aboutField(), 'Hi{Enter}there');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledWith(1, {
        about: 'Hi\nthere',
      })
    );
  });

  it('sends showLastSeen false when the box is unticked, and nothing else', async () => {
    mockedUsers.updateUser.mockResolvedValue({
      ...session,
      showLastSeen: false,
    });
    const user = userEvent.setup();
    renderForm();

    await user.click(lastSeenBox());
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledWith(1, {
        showLastSeen: false,
      })
    );
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('refuses an About over the limit with a message and does not send it', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(aboutField());
    await user.paste('x'.repeat(ABOUT_MAX_LENGTH + 1));
    await user.click(saveButton());

    expect(
      await screen.findByText(
        `About must be at most ${ABOUT_MAX_LENGTH} characters`
      )
    ).toBeInTheDocument();
    expect(mockedUsers.updateUser).not.toHaveBeenCalled();
  });

  it('accepts an About of exactly the limit', async () => {
    mockedUsers.updateUser.mockResolvedValue(session);
    const user = userEvent.setup();
    renderForm();

    await user.click(aboutField());
    await user.paste('x'.repeat(ABOUT_MAX_LENGTH));
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledTimes(1)
    );
  });

  it('prefills the four fields and keeps Save disabled with no change', () => {
    renderForm();

    expect(field('Login')).toHaveValue('bob');
    expect(field('First name')).toHaveValue('Bob');
    expect(field('Last name')).toHaveValue('Bobson');
    expect(field('Email')).toHaveValue('bob@example.com');
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('sends only the changed field and shows the success message', async () => {
    mockedUsers.updateUser.mockResolvedValue({ ...session, login: 'bobby' });
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Login', 'bobby');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledWith(1, {
        login: 'bobby',
      })
    );
    expect(await screen.findByText('Account updated.')).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(field('Login')).toHaveValue('bobby');
  });

  it('asks for the current password only while Email differs, and requires it', async () => {
    mockedUsers.updateUser.mockResolvedValue({
      ...session,
      email: 'new@example.com',
    });
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Email', 'new@example.com');
    const password = await screen.findByLabelText('Current password');

    await user.click(saveButton());
    expect(
      await screen.findByText('Enter your current password')
    ).toBeInTheDocument();
    expect(mockedUsers.updateUser).not.toHaveBeenCalled();

    await user.type(password, 'secret123');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenCalledWith(1, {
        email: 'new@example.com',
        currentPassword: 'secret123',
      })
    );
  });

  it('drops the password field when Email returns to the saved value', async () => {
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Email', 'new@example.com');
    await screen.findByLabelText('Current password');

    await replaceText(user, 'Email', 'bob@example.com');

    await waitFor(() =>
      expect(screen.queryByLabelText('Current password')).toBeNull()
    );
    expect(saveButton()).toBeDisabled();
  });

  it('diffs the next edit against the values saved last', async () => {
    mockedUsers.updateUser.mockResolvedValue({ ...session, login: 'bobby' });
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Login', 'bobby');
    await user.click(saveButton());
    await screen.findByText('Account updated.');
    await waitFor(() => expect(saveButton()).toBeDisabled());

    mockedUsers.updateUser.mockResolvedValue({
      ...session,
      login: 'bobby',
      firstName: 'Rob',
    });
    await replaceText(user, 'First name', 'Rob');
    await user.click(saveButton());

    await waitFor(() =>
      expect(mockedUsers.updateUser).toHaveBeenLastCalledWith(1, {
        firstName: 'Rob',
      })
    );
    expect(mockedUsers.updateUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      new ApiError(409, 'login is already taken', { field: 'login' }),
      'Login',
      'This login is already taken.',
    ],
    [
      new ApiError(409, 'email is already taken', { field: 'email' }),
      'Email',
      'This email is already taken.',
    ],
    [
      new ApiError(403, 'Current password is incorrect'),
      'Email',
      'Current password is incorrect',
    ],
    [
      new ApiError(400, 'Request validation failed', [
        { path: ['firstName'], message: 'Too long' },
      ]),
      'First name',
      'Too long',
    ],
  ])('shows %# on its field', async (error, changedField, text) => {
    mockedUsers.updateUser.mockRejectedValue(error);
    const user = userEvent.setup();
    renderForm();

    if (changedField === 'Email') {
      await replaceText(user, 'Email', 'new@example.com');
      await user.type(
        await screen.findByLabelText('Current password'),
        'secret123'
      );
    } else {
      await replaceText(user, changedField, 'Changed');
    }
    await user.click(saveButton());

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows any other error in an Alert and keeps the form values', async () => {
    mockedUsers.updateUser.mockRejectedValue(
      new ApiError(403, 'You may not change your own status')
    );
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Login', 'bobby');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You may not change your own status'
    );
    expect(field('Login')).toHaveValue('bobby');
  });

  it('refuses a login over the limit without calling the api', async () => {
    const user = userEvent.setup();
    renderForm();

    await replaceText(user, 'Login', 'a'.repeat(LOGIN_MAX_LENGTH + 1));
    await user.click(saveButton());

    expect(
      await screen.findByText('Login must be 3 to 64 characters')
    ).toBeInTheDocument();
    expect(mockedUsers.updateUser).not.toHaveBeenCalled();
  });
});
