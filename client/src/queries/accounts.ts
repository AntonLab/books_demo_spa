import { useQuery } from '@tanstack/react-query';
import { getAccountProfile } from '../api/accounts';
import { queryKeys } from './keys';

// No retry override: a 404 reaches the page as an ApiError.
export const usePublicProfile = (id: number | undefined) => {
  return useQuery({
    queryKey: queryKeys.accountProfile(id as number),
    queryFn: () => getAccountProfile(id as number),
    enabled: id !== undefined,
  });
};
