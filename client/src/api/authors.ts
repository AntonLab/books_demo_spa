import { request } from './client';
import type { AuthorSummary } from '../types/user';

// The Co-author picker's search: accounts holding the author Role, never with
// an email. A blank term is not sent — the server rejects an empty `q` — and
// lists the first authors instead.
export const searchAuthors = async (q: string): Promise<AuthorSummary[]> => {
  const query = q ? `?${new URLSearchParams({ q }).toString()}` : '';
  const { items } = await request<{ items: AuthorSummary[] }>(
    `/authors${query}`
  );
  return items;
};
