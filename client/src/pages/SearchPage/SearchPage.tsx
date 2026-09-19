import type { FC } from 'react';
import { Alert, Empty, Skeleton, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { BookList } from '@/components/organisms/BookList';
import { SeriesCard } from '@/components/organisms/SeriesCard';
import { useBooksInSeries, useSearchBooks } from '@/queries/books';
import { useSeries } from '@/queries/series';

const SERIES_GONE = 'This series no longer exists.';

// One filter per visit: `?series=` lists a series' books, anything else is a
// search for `?q=`. The header's search bar navigates to a bare `?q=`, so
// searching from a series' results starts over rather than narrowing them.
export const SearchPage: FC = () => {
  const [searchParams] = useSearchParams();
  const seriesParam = searchParams.get('series');

  if (seriesParam !== null) {
    const seriesId = Number(seriesParam);
    // Not a query the server could answer, so it is not asked one.
    return Number.isInteger(seriesId) && seriesId > 0 ? (
      <SeriesResults seriesId={seriesId} />
    ) : (
      <Empty description={SERIES_GONE} />
    );
  }

  return <TermResults q={(searchParams.get('q') ?? '').trim()} />;
};

const TermResults: FC<{ q: string }> = ({ q }) => {
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

// The series heads its own results, since there is no series page to send a
// reader to. Both requests leave together: the book list does not need the
// series to know what to ask for.
const SeriesResults: FC<{ seriesId: number }> = ({ seriesId }) => {
  const series = useSeries(seriesId);
  const books = useBooksInSeries(seriesId);

  if (series.isError) {
    // A link from a book page outlives the series it names.
    return series.error instanceof ApiError && series.error.status === 404 ? (
      <Empty description={SERIES_GONE} />
    ) : (
      <Alert type="error" message="Could not load this series." />
    );
  }
  if (series.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;

  return (
    <>
      <SeriesCard series={series.data} />
      <BookList
        items={books.data?.items ?? []}
        isPending={books.isPending}
        isError={books.isError}
        error={books.error}
        emptyText="No book in this series has been published yet."
      />
    </>
  );
};
