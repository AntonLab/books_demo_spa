import { request } from './client';
import type { PublicUser } from '../types/user';

export interface RegisterInput {
  login: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  login: string;
  password: string;
}

export function register(input: RegisterInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function login(input: LoginInput): Promise<PublicUser> {
  return request<PublicUser>('/auth/login', { method: 'POST', body: input });
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}

export function me(): Promise<PublicUser> {
  return request<PublicUser>('/auth/me');
}

export function requestReset(email: string): Promise<void> {
  return request<void>('/auth/password-reset/request', {
    method: 'POST',
    body: { email },
  });
}

export function confirmReset(token: string, password: string): Promise<void> {
  return request<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, password },
  });
}
