import { ApiError } from '../api/client';
import * as authApi from '../api/auth';
import { createAppStore } from './index';
import {
  bootstrapSession,
  closeModal,
  confirmPasswordReset,
  loginUser,
  logoutUser,
  openModal,
  openResetConfirm,
  registerUser,
  requestPasswordReset,
} from './authSlice';
import type { PublicUser } from '../types/user';

jest.mock('../api/auth');

const mockedApi = jest.mocked(authApi);

const user: PublicUser = {
  id: 1,
  login: 'bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobson',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('authSlice modal actions', () => {
  it('starts with no modal open and no user', () => {
    const store = createAppStore();

    expect(store.getState().auth).toMatchObject({
      user: null,
      status: 'idle',
      activeModal: null,
      resetToken: null,
    });
  });

  it('opens a named modal', () => {
    const store = createAppStore();

    store.dispatch(openModal('register'));

    expect(store.getState().auth.activeModal).toBe('register');
  });

  it('opens the confirm modal with the token from the URL', () => {
    const store = createAppStore();

    store.dispatch(openResetConfirm('tok-123'));

    expect(store.getState().auth).toMatchObject({
      activeModal: 'resetConfirm',
      resetToken: 'tok-123',
    });
  });

  it('clears the modal, its error and the token on close', () => {
    const store = createAppStore();
    store.dispatch(openResetConfirm('tok-123'));

    store.dispatch(closeModal());

    expect(store.getState().auth).toMatchObject({
      activeModal: null,
      resetToken: null,
      error: null,
    });
  });
});

describe('bootstrapSession', () => {
  it('stores the user when a session exists', async () => {
    mockedApi.me.mockResolvedValue(user);
    const store = createAppStore();

    await store.dispatch(bootstrapSession());

    expect(store.getState().auth).toMatchObject({
      user,
      status: 'ready',
      error: null,
    });
  });

  it('treats a 401 as "not logged in", not as an error', async () => {
    mockedApi.me.mockRejectedValue(
      new ApiError(401, 'Authentication required')
    );
    const store = createAppStore();

    await store.dispatch(bootstrapSession());

    const { auth } = store.getState();
    expect(auth.status).toBe('ready');
    expect(auth.user).toBeNull();
    // The single easiest thing to get wrong here: an anonymous first-time
    // visitor must not be shown an error.
    expect(auth.error).toBeNull();
  });

  it('records a real failure, such as the server being down', async () => {
    mockedApi.me.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    const store = createAppStore();

    await store.dispatch(bootstrapSession());

    const { auth } = store.getState();
    expect(auth.status).toBe('ready');
    expect(auth.user).toBeNull();
    expect(auth.error).toBe('Internal Server Error');
  });

  it('is loading while the request is in flight', () => {
    mockedApi.me.mockReturnValue(new Promise(() => {}));
    const store = createAppStore();

    void store.dispatch(bootstrapSession());

    expect(store.getState().auth.status).toBe('loading');
  });
});

describe('loginUser', () => {
  it('stores the user and closes the modal on success', async () => {
    mockedApi.login.mockResolvedValue(user);
    const store = createAppStore();
    store.dispatch(openModal('login'));

    await store.dispatch(loginUser({ login: 'bob', password: 'secret123' }));

    expect(store.getState().auth).toMatchObject({
      user,
      activeModal: null,
      status: 'ready',
    });
  });

  it('rejects with the status and message so the form can show them', async () => {
    mockedApi.login.mockRejectedValue(new ApiError(401, 'Invalid credentials'));
    const store = createAppStore();

    const result = await store.dispatch(
      loginUser({ login: 'bob', password: 'wrong' })
    );

    expect(loginUser.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({
      status: 401,
      message: 'Invalid credentials',
      details: undefined,
    });
    expect(store.getState().auth.user).toBeNull();
  });
});

describe('registerUser', () => {
  it('stores the user and closes the modal on success', async () => {
    mockedApi.register.mockResolvedValue(user);
    const store = createAppStore();
    store.dispatch(openModal('register'));

    await store.dispatch(
      registerUser({
        login: 'bob',
        email: 'bob@example.com',
        password: 'secret123',
        firstName: 'Bob',
        lastName: 'Bobson',
      })
    );

    expect(store.getState().auth).toMatchObject({ user, activeModal: null });
  });

  it('preserves the 409 conflict field in the rejection payload', async () => {
    mockedApi.register.mockRejectedValue(
      new ApiError(409, 'login is already taken', { field: 'login' })
    );
    const store = createAppStore();

    const result = await store.dispatch(
      registerUser({
        login: 'bob',
        email: 'bob@example.com',
        password: 'secret123',
        firstName: 'Bob',
        lastName: 'Bobson',
      })
    );

    expect(result.payload).toEqual({
      status: 409,
      message: 'login is already taken',
      details: { field: 'login' },
    });
  });
});

describe('logoutUser', () => {
  it('clears the user', async () => {
    mockedApi.me.mockResolvedValue(user);
    mockedApi.logout.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.dispatch(bootstrapSession());

    await store.dispatch(logoutUser());

    expect(store.getState().auth.user).toBeNull();
  });
});

describe('password reset thunks', () => {
  it('resolves the request thunk on the always-202 response', async () => {
    mockedApi.requestReset.mockResolvedValue(undefined);
    const store = createAppStore();

    const result = await store.dispatch(
      requestPasswordReset('bob@example.com')
    );

    expect(requestPasswordReset.fulfilled.match(result)).toBe(true);
  });

  it('rejects the confirm thunk with the server message on a bad token', async () => {
    mockedApi.confirmReset.mockRejectedValue(
      new ApiError(400, 'Reset token is invalid or has expired')
    );
    const store = createAppStore();

    const result = await store.dispatch(
      confirmPasswordReset({ token: 'nope', password: 'newsecret1' })
    );

    expect(confirmPasswordReset.rejected.match(result)).toBe(true);
    expect(result.payload).toMatchObject({
      status: 400,
      message: 'Reset token is invalid or has expired',
    });
  });
});
