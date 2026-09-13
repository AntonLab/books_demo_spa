import { useQuery } from '@tanstack/react-query';
import { listSeries } from '../api/series';
import { queryKeys } from './keys';

// The series a Co-author can file a book under. One page at the server's cap:
// an author's own series are few.
export const useMySeries = (userId: number | undefined) => {
  return useQuery({
    queryKey: queryKeys.series({ userId, limit: 100 }),
    queryFn: () => listSeries({ userId, limit: 100 }),
    enabled: userId !== undefined,
  });
};
