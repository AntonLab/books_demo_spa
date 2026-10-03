import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

// A work is a book or a series; most writes that touch one leave both lists
// and every detail stale.
export const invalidateWorks = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allBooks }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allSeries }),
  ]);
