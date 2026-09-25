import { request } from './client';
import type { RegistrableRole } from 'shared';
import type { PublicUser } from '../types/user';

export interface RegisterInput {
  login: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  // The only role a public form may ask for. The server narrows it again, so
  // this is a convenience, not the guard.
  role?: RegistrableRole;
}

export interface LoginInput {
  login: string;
  password: string;
}

export const register = (input: RegisterInput): Promise<PublicUser> => {
  return request<PublicUser>('/auth/register', {
    method: 'POST',
    body: input,
  });
};

export const login = (input: LoginInput): Promise<PublicUser> => {
  return request<PublicUser>('/auth/login', { method: 'POST', body: input });
};

export const logout = (): Promise<void> => {
  return request<void>('/auth/logout', { method: 'POST' });
};

export const me = (): Promise<PublicUser> => {
  return request<PublicUser>('/auth/me');
};

export const requestReset = (email: string): Promise<void> => {
  return request<void>('/auth/password-reset/request', {
    method: 'POST',
    body: { email },
  });
};

export const confirmReset = (
  token: string,
  password: string
): Promise<void> => {
  return request<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, password },
  });
};
