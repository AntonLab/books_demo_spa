import type { FC } from 'react';
import { Empty, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { BookList } from '@/components/organisms/BookList';
import { useSearchBooks } from '@/queries/books';

export const SearchPage: FC = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();

  // The URL is the only source of the query, so this covers a fresh visit, a
  // reload, a pasted link and a back-button press identically: `q` is part of
  // the cache key, so changing it is what starts the next search — and
  // returning to a term searched a moment ago is served from cache.
  const { data, isPending, isError, error } = useSearchBooks(q);
  const total = data?.total ?? 0;

  // Load-bearing, not cosmetic. `useSearchBooks` is disabled on a blank term,
  // and a disabled query reports `isPending: true` indefinitely, so falling
  // through to BookList here would render a skeleton that never resolves.
  if (q.length === 0) {
    return <Empty description="Enter a search term to find books." />;
  }

  return (
    <>
      <Typography.Title level={2}>
        {isError
          ? `Search failed for "${q}"`
          : isPending
            ? `Searching for "${q}"`
            : `${total} ${total === 1 ? 'result' : 'results'} for "${q}"`}
      </Typography.Title>

      <BookList
        items={data?.items ?? []}
        isPending={isPending}
        isError={isError}
        error={error}
        emptyText={`No books match "${q}".`}
      />
    </>
  );
};
