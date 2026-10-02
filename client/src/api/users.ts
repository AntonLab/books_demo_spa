import { request } from './client';
import type { PublicUser } from '../types/api';

// The Account's own writes: its fields and its Avatar. Its own module, the way
// authors.ts is.
export interface AccountChanges {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  currentPassword?: string;
}

export const updateUser = (
  userId: number,
  changes: AccountChanges
): Promise<PublicUser> => {
  return request<PublicUser>(`/users/${userId}`, {
    method: 'PATCH',
    body: changes,
  });
};

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
