import { useCallback, useState } from 'react';
import { usePageClamp } from '@/components/organisms/ProfileWorksPanel/useProfileLists';
import { useReadingListsByBook } from '@/queries/readingLists';

const BOOK_READING_LISTS_PAGE_SIZE = 10;

export const useBookReadingLists = (bookId: number) => {
  const [page, setPage] = useState(1);
  const pageSize = BOOK_READING_LISTS_PAGE_SIZE;
  const query = useReadingListsByBook(bookId, page, pageSize);

  const moveTo = useCallback((last: number) => setPage(last), []);
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
    goToPage: setPage,
  };
};

export type BookReadingLists = ReturnType<typeof useBookReadingLists>;
