import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useConfirmReset,
  useLogin,
  useLogout,
  useRegister,
  useRequestReset,
  useSession,
} from './auth';
import { queryKeys } from './keys';
import { createTestQueryClient } from '../test/queryClient';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { PublicUser } from '../types/user';

jest.mock('../api/auth');

const mockedAuth = jest.mocked(authApi);

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

const wrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useSession', () => {
  it('resolves the signed-in user', async () => {
    mockedAuth.me.mockResolvedValue(user);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useSession(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(user);
  });

  it('treats a 401 as "nobody is signed in", not as an error', async () => {
    mockedAuth.me.mockRejectedValue(
      new ApiError(401, 'Authentication required')
    );
    const client = createTestQueryClient();

    const { result } = renderHook(() => useSession(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    // Rejecting here would flash an error at every anonymous arrival.
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('propagates a real failure, such as the server being down', async () => {
    mockedAuth.me.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    const client = createTestQueryClient();

    const { result } = renderHook(() => useSession(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Internal Server Error');
  });
});

describe('useLogin', () => {
  it('writes the returned user into the session cache', async () => {
    mockedAuth.login.mockResolvedValue(user);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useLogin(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync({ login: 'bob', password: 'secret123' });

    expect(client.getQueryData(queryKeys.session)).toEqual(user);
    expect(mockedAuth.login).toHaveBeenCalledWith({
      login: 'bob',
      password: 'secret123',
    });
  });

  it('rejects with the ApiError itself, status and details intact', async () => {
    mockedAuth.login.mockRejectedValue(new ApiError(403, 'Account is blocked'));
    const client = createTestQueryClient();

    const { result } = renderHook(() => useLogin(), {
      wrapper: wrapper(client),
    });

    // The whole reason AuthFailure and toFailure() could be deleted: RTK
    // serialised a thrown error and dropped its custom properties, so the
    // status had to be copied onto a plain object by hand. A mutation hands
    // back the instance.
    await expect(
      result.current.mutateAsync({ login: 'bob', password: 'secret123' })
    ).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData(queryKeys.session)).toBeUndefined();
  });
});

describe('useRegister', () => {
  it('writes the new user into the session cache', async () => {
    mockedAuth.register.mockResolvedValue(user);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useRegister(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync({
      login: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      firstName: 'Bob',
      lastName: 'Bobson',
    });

    expect(client.getQueryData(queryKeys.session)).toEqual(user);
  });

  it('preserves the 409 conflict field on the rejection', async () => {
    mockedAuth.register.mockRejectedValue(
      new ApiError(409, 'login is already taken', { field: 'login' })
    );
    const client = createTestQueryClient();

    const { result } = renderHook(() => useRegister(), {
      wrapper: wrapper(client),
    });

    await expect(
      result.current.mutateAsync({
        login: 'bob',
        email: 'bob@example.com',
        password: 'secret123',
        firstName: 'Bob',
        lastName: 'Bobson',
      })
    ).rejects.toMatchObject({
      status: 409,
      details: { field: 'login' },
    });
  });
});

describe('useLogout', () => {
  it('clears the session cache', async () => {
    mockedAuth.logout.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.session, user);

    const { result } = renderHook(() => useLogout(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync();

    expect(client.getQueryData(queryKeys.session)).toBeNull();
  });
});

describe('useRequestReset', () => {
  it('sends the address and leaves the session alone', async () => {
    mockedAuth.requestReset.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.session, user);

    const { result } = renderHook(() => useRequestReset(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync('bob@example.com');

    expect(mockedAuth.requestReset).toHaveBeenCalledWith('bob@example.com');
    expect(client.getQueryData(queryKeys.session)).toEqual(user);
  });
});

describe('useConfirmReset', () => {
  it('signs the client out, since the server kills every session', async () => {
    mockedAuth.confirmReset.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.session, user);

    const { result } = renderHook(() => useConfirmReset(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync({
      token: 'tok-123',
      password: 'newsecret1',
    });

    expect(mockedAuth.confirmReset).toHaveBeenCalledWith(
      'tok-123',
      'newsecret1'
    );
    expect(client.getQueryData(queryKeys.session)).toBeNull();
  });
});
