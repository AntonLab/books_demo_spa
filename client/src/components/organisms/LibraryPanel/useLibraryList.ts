import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { READING_STATUSES } from 'shared';
import type { ReadingStatus } from 'shared';
import { usePageClamp } from '@/components/organisms/ProfileWorksPanel/useProfileLists';
import { useLibrary } from '@/queries/library';
import { pagingOf } from '@/types/bookSearch';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';

const libraryStatusOf = (params: URLSearchParams): ReadingStatus | undefined =>
  READING_STATUSES.find((status) => status === params.get('status'));

export const useLibraryList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = libraryStatusOf(searchParams);
  const { page, pageSize } = pagingOf(searchParams);
  const query = useLibrary({ status, current: page, pageSize });

  const writeParams = useCallback(
    (
      next: {
        status: ReadingStatus | undefined;
        page: number;
        pageSize: number;
      },
      replace: boolean
    ) => {
      const params = new URLSearchParams();
      if (next.status) params.set('status', next.status);
      if (next.page > 1) params.set('page', String(next.page));
      if (next.pageSize !== DEFAULT_PAGE_SIZE)
        params.set('pageSize', String(next.pageSize));
      setSearchParams(params, { replace });
    },
    [setSearchParams]
  );

  const moveTo = useCallback(
    (last: number) => writeParams({ status, page: last, pageSize }, true),
    [writeParams, status, pageSize]
  );
  const overshooting = usePageClamp(
    { page, pageSize, total: query.data?.total },
    moveTo
  );

  return {
    status,
    items: overshooting ? [] : (query.data?.items ?? []),
    total: query.data?.total ?? 0,
    page,
    pageSize,
    isPending: query.isPending || overshooting,
    error: query.error,
    setStatus: (next: ReadingStatus | undefined) =>
      writeParams({ status: next, page: 1, pageSize }, false),
    goToPage: (nextPage: number, nextPageSize: number) =>
      writeParams({ status, page: nextPage, pageSize: nextPageSize }, false),
  };
};
