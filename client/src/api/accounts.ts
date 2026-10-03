import { request } from './client';
import type { AccountProfile } from '../types/api';

export const getAccountProfile = (id: number): Promise<AccountProfile> => {
  return request<AccountProfile>(`/accounts/${id}`);
};
