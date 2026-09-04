import { request } from './client';
import type { ListResponse } from '../types/api';
import type { PublicBook } from '../types/book';

export interface ListBooksParams {
  q?: string;
  limit?: number;
  offset?: number;
}

// One function, two callers: `useBooks` fetches the unfiltered first page and
// `useSearchBooks` passes a `q`. The server's schema rejects an empty `q`
// (`z.string().min(1)`), so a blank term is omitted rather than sent —
// `useSearchBooks` also disables itself on one, which stops the request
// happening at all rather than merely shaping the URL.
export function listBooks(
  params: ListBooksParams = {}
): Promise<ListResponse<PublicBook>> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  const query = search.toString();
  return request<ListResponse<PublicBook>>(
    query ? `/books?${query}` : '/books'
  );
}
