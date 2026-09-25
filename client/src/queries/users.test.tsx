import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDeleteAvatar, useUploadAvatar } from './users';
import { createTestQueryClient } from '../test/queryClient';
import * as usersApi from '../api/users';
import type { PublicUser } from '../types/api';

jest.mock('../api/users');
const mockedUsers = jest.mocked(usersApi);

const session: PublicUser = {
  id: 7,
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

const wrapper = (client = createTestQueryClient()) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useUploadAvatar', () => {
  it('uploads and invalidates the session, books, series, comments and authors caches', async () => {
    mockedUsers.uploadAvatar.mockResolvedValue({
      ...session,
      avatarUrl: '/api/users/7/avatar?v=2',
    });
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const file = new File([new Uint8Array([1])], 'a.webp', {
      type: 'image/webp',
    });

    const { result } = renderHook(() => useUploadAvatar(7), {
      wrapper: wrapper(client),
    });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedUsers.uploadAvatar).toHaveBeenCalledWith(7, file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['authors'] });
  });
});

describe('useDeleteAvatar', () => {
  it('deletes and invalidates the same caches', async () => {
    mockedUsers.deleteAvatar.mockResolvedValue(undefined);
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteAvatar(7), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedUsers.deleteAvatar).toHaveBeenCalledWith(7);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['comments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['authors'] });
  });
});
