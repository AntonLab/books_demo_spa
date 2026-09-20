import type { FC } from 'react';
import { Alert, Empty, Skeleton, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { BookList } from '@/components/organisms/BookList';
import { SeriesCard } from '@/components/organisms/SeriesCard';
import {
  useBooksInGenre,
  useBooksInSeries,
  useSearchBooks,
} from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useSeries, useSeriesInGenre } from '@/queries/series';
import type { PublicGenre } from '@/types/genre';

const SERIES_GONE = 'This series no longer exists.';
const GENRE_GONE = 'This genre no longer exists.';

// One filter per visit, and when several are present `series` wins, then
// `genre`, then `q`: the header's search bar navigates to a bare `?q=` and a
// Genre in its menu to a bare `?genre=`, so each starts over rather than
// narrowing what is on screen.
export const SearchPage: FC = () => {
  const [searchParams] = useSearchParams();
  const seriesParam = searchParams.get('series');
  const genreParam = searchParams.get('genre');

  if (seriesParam !== null) {
    const seriesId = Number(seriesParam);
    // Not a query the server could answer, so it is not asked one.
    return Number.isInteger(seriesId) && seriesId > 0 ? (
      <SeriesResults seriesId={seriesId} />
    ) : (
      <Empty description={SERIES_GONE} />
    );
  }

  if (genreParam !== null) {
    const genreId = Number(genreParam);
    return Number.isInteger(genreId) && genreId > 0 ? (
      <GenreResults genreId={genreId} />
    ) : (
      <Empty description={GENRE_GONE} />
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
      <Alert type="error" title="Could not load this series." />
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

// The Genre's name comes from the list the header already holds, not from a
// per-id endpoint: there is none. Resolving it here also keeps the two result
// queries unmounted until the Genre is known to exist, so an id nobody holds
// asks for no books and no series.
const GenreResults: FC<{ genreId: number }> = ({ genreId }) => {
  const genres = useGenres();

  if (genres.isError) {
    return <Alert type="error" title="Could not load the genres." />;
  }
  if (genres.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;

  const genre = genres.data.items.find((entry) => entry.id === genreId);

  // A link from a book page outlives the Genre it names.
  return genre === undefined ? (
    <Empty description={GENRE_GONE} />
  ) : (
    <GenreBooks genre={genre} />
  );
};

// The Genre's books first, then its series: a reader looking for a genre is
// looking for something to read, and a series is a way in rather than a work.
const GenreBooks: FC<{ genre: PublicGenre }> = ({ genre }) => {
  const books = useBooksInGenre(genre.id);
  const series = useSeriesInGenre(genre.id);
  const seriesItems = series.data?.items ?? [];

  return (
    <>
      <Typography.Title level={2}>{genre.name}</Typography.Title>

      <BookList
        items={books.data?.items ?? []}
        isPending={books.isPending}
        isError={books.isError}
        error={books.error}
        emptyText="No books in this genre yet."
      />

      {series.isError && (
        <Alert type="error" title="Could not load the series in this genre." />
      )}

      {/* Left out while it loads and when it is empty: an empty heading would
          only be noise under a page that already has its books. */}
      {seriesItems.length > 0 && (
        <>
          <Typography.Title level={3}>Series</Typography.Title>
          {seriesItems.map((entry) => (
            <SeriesCard key={entry.id} series={entry} linked />
          ))}
        </>
      )}
    </>
  );
};
