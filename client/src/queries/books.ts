import { useQuery } from '@tanstack/react-query';
import { listBooks } from '../api/books';
import { queryKeys } from './keys';

// The first page only. Paging is a documented non-goal; `total` is kept so the
// count can be displayed and paging added later without a state change.
export const BOOKS_PAGE_SIZE = 20;

export const useBooks = () => {
  return useQuery({
    queryKey: queryKeys.books({ limit: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ limit: BOOKS_PAGE_SIZE }),
  });
};

// `enabled` keeps a blank term off the network entirely. It agrees with
// `listBooks`, which already omits an empty `q` because the server's schema
// rejects it (`z.string().min(1)`) — but neither guard makes the other
// redundant: that one shapes the URL, this one stops the request happening.
//
// A disabled query reports `isPending: true` with `fetchStatus: 'idle'`
// indefinitely, which is why SearchPage must return before rendering BookList
// when the term is blank.
export const useSearchBooks = (q: string) => {
  return useQuery({
    queryKey: queryKeys.books({ q, limit: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ q, limit: BOOKS_PAGE_SIZE }),
    enabled: q.length > 0,
  });
};
