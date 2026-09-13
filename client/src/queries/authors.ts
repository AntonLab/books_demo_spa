import { useQuery } from '@tanstack/react-query';
import { searchAuthors } from '../api/authors';
import { queryKeys } from './keys';

// One cache entry per search term, so typing back to an earlier term answers
// from the cache instead of the network.
export const useAuthorSearch = (q: string) => {
  return useQuery({
    queryKey: queryKeys.authors(q),
    queryFn: () => searchAuthors(q),
  });
};
