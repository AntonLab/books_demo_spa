import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { usePageClamp } from '@/components/organisms/ProfileWorksPanel/useProfileLists';
import { useReadingListsByAccount } from '@/queries/readingLists';
import { pagingOf } from '@/types/bookSearch';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';

export const useProfileReadingLists = (viewerId: number) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize } = pagingOf(searchParams);
  const query = useReadingListsByAccount(
    { userId: viewerId, current: page, pageSize },
    true
  );

  const writeParams = useCallback(
    (nextPage: number, nextPageSize: number, replace: boolean) => {
      const params = new URLSearchParams();
      if (nextPage > 1) params.set('page', String(nextPage));
      if (nextPageSize !== DEFAULT_PAGE_SIZE)
        params.set('pageSize', String(nextPageSize));
      setSearchParams(params, { replace });
    },
    [setSearchParams]
  );

  const moveTo = useCallback(
    (last: number) => writeParams(last, pageSize, true),
    [writeParams, pageSize]
  );
  const overshooting = usePageClamp(
    { page, pageSize, total: query.data?.total },
    moveTo
  );

  return {
    items: overshooting ? [] : (query.data?.items ?? []),
    total: query.data?.total ?? 0,
    page,
    pageSize,
    isPending: query.isPending || overshooting,
    error: query.error,
    goToPage: (nextPage: number, nextPageSize: number) =>
      writeParams(nextPage, nextPageSize, false),
  };
};
