import { useEffect } from 'react';
import type { FC } from 'react';
import { Empty, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { BookList } from '@/components/organisms/BookList';
import { searchBooks } from '@/store/searchSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export const SearchPage: FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();
  const { items, total, status, error } = useAppSelector(
    (state) => state.search
  );

  // The URL is the only source of the query, so this covers a fresh visit, a
  // reload, a pasted link and a back-button press identically.
  useEffect(() => {
    if (q.length > 0) {
      void dispatch(searchBooks(q));
    }
  }, [dispatch, q]);

  if (q.length === 0) {
    return <Empty description="Enter a search term to find books." />;
  }

  return (
    <>
      <Typography.Title level={2}>
        {status === 'ready'
          ? `${total} ${total === 1 ? 'result' : 'results'} for "${q}"`
          : status === 'error'
            ? `Search failed for "${q}"`
            : `Searching for "${q}"`}
      </Typography.Title>

      <BookList
        items={items}
        status={status}
        error={error}
        emptyText={`No books match "${q}".`}
      />
    </>
  );
};
