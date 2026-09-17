import { request } from './client';
import type { PublicUser } from '../types/user';

// K2: the Account's Avatar. Its own module, the way authors.ts is — the
// users resource has no other writes reachable from this client yet.
export const uploadAvatar = (
  userId: number,
  file: File
): Promise<PublicUser> => {
  return request<PublicUser>(`/users/${userId}/avatar`, {
    method: 'PUT',
    body: file,
  });
};

export const deleteAvatar = (userId: number): Promise<void> => {
  return request<void>(`/users/${userId}/avatar`, { method: 'DELETE' });
};
