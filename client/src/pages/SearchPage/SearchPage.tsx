import type { FC, ReactNode } from 'react';
import { Alert, Empty, Flex, Segmented, Skeleton, Typography } from 'antd';
import type { ColProps } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faTableCellsLarge } from '@fortawesome/free-solid-svg-icons';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { BookCard } from '@/components/organisms/BookCard';
import { CardList, TILE_COLUMNS } from '@/components/organisms/CardList';
import { SeriesCard } from '@/components/organisms/SeriesCard';
import {
  useBooksInGenre,
  useBooksInSeries,
  useSearchBooks,
  useSortedBooks,
} from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useSeries, useSeriesInGenre } from '@/queries/series';
import {
  devicePreferences,
  type ResultsLayout,
} from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { BOOK_SORT_LABELS, BOOK_SORTS, type BookSort } from '@/types/book';
import type { PublicGenre } from '@/types/genre';
import styles from './SearchPage.module.css';

const SERIES_GONE = 'This series no longer exists.';
const GENRE_GONE = 'This genre no longer exists.';

const RESULTS_COLUMNS: Record<ResultsLayout, ColProps> = {
  grid: TILE_COLUMNS,
  list: { span: 24 },
};

// A Device preference, so it holds across every term, Genre and Series
// searched on this device.
const useResultsLayout = () =>
  useAppSelector((state) => state.devicePreferences.resultsLayout);

// Shown whenever the page has something to search for, loading or failed
// included, so it never jumps in late or leaves.
const ResultsBar: FC<{ heading?: ReactNode }> = ({ heading }) => {
  const layout = useResultsLayout();
  const dispatch = useAppDispatch();

  return (
    <Flex
      justify={heading === undefined ? 'end' : 'space-between'}
      align="center"
      gap="middle"
      wrap
      className={styles.bar}
    >
      {heading}
      <Segmented<ResultsLayout>
        aria-label="Results layout"
        value={layout}
        onChange={(value) =>
          dispatch(devicePreferences.resultsLayoutChanged(value))
        }
        options={[
          {
            value: 'grid',
            icon: (
              <FontAwesomeIcon icon={faTableCellsLarge} aria-label="Grid" />
            ),
            tooltip: 'Grid',
          },
          {
            value: 'list',
            icon: <FontAwesomeIcon icon={faList} aria-label="List" />,
            tooltip: 'List',
          },
        ]}
      />
    </Flex>
  );
};

const isBookSort = (value: string | null): value is BookSort =>
  (BOOK_SORTS as readonly (string | null)[]).includes(value);

// One filter per visit, and when several are present `series` wins, then
// `genre`, then `q`, then `sort`: the header's search bar navigates to a bare
// `?q=`, a Genre in its menu to a bare `?genre=` and a main page section to a
// bare `?sort=`, so each starts over rather than narrowing what is on screen.
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
    // A malformed id matches no Genre's id either, so nothing downstream —
    // the list, the books, or the series — is worth asking about it.
    return Number.isInteger(genreId) && genreId > 0 ? (
      <GenreResults genreId={genreId} />
    ) : (
      <Empty description={GENRE_GONE} />
    );
  }

  const q = (searchParams.get('q') ?? '').trim();
  const sort = searchParams.get('sort');
  // An unknown ranking is no search at all, like a blank term.
  return q.length === 0 && isBookSort(sort) ? (
    <SortedResults sort={sort} />
  ) : (
    <TermResults q={q} />
  );
};

const SortedResults: FC<{ sort: BookSort }> = ({ sort }) => {
  const { data, isPending, isError, error } = useSortedBooks(sort);
  const layout = useResultsLayout();

  return (
    <>
      <ResultsBar
        heading={
          <Typography.Title level={2} className={styles.heading}>
            {BOOK_SORT_LABELS[sort]}
          </Typography.Title>
        }
      />
      <CardList
        noun="books"
        items={data?.items ?? []}
        renderItem={(book) => <BookCard book={book} tile={layout === 'grid'} />}
        columns={RESULTS_COLUMNS[layout]}
        isPending={isPending}
        isError={isError}
        error={error}
      />
    </>
  );
};

const TermResults: FC<{ q: string }> = ({ q }) => {
  // The URL is the only source of the query, so this covers a fresh visit, a
  // reload, a pasted link and a back-button press identically: `q` is part of
  // the cache key, so changing it is what starts the next search — and
  // returning to a term searched a moment ago is served from cache.
  const { data, isPending, isError, error } = useSearchBooks(q);
  const layout = useResultsLayout();
  const total = data?.total ?? 0;

  // Load-bearing, not cosmetic. `useSearchBooks` is disabled on a blank term,
  // and a disabled query reports `isPending: true` indefinitely, so falling
  // through to CardList here would render a skeleton that never resolves.
  if (q.length === 0) {
    return <Empty description="Enter a search term to find books." />;
  }

  return (
    <>
      <ResultsBar
        heading={
          <Typography.Title level={2} className={styles.heading}>
            {isError
              ? `Search failed for "${q}"`
              : isPending
                ? `Searching for "${q}"`
                : `${total} ${total === 1 ? 'result' : 'results'} for "${q}"`}
          </Typography.Title>
        }
      />

      <CardList
        noun="books"
        items={data?.items ?? []}
        renderItem={(book) => <BookCard book={book} tile={layout === 'grid'} />}
        columns={RESULTS_COLUMNS[layout]}
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
  const layout = useResultsLayout();

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
      <ResultsBar />
      <CardList
        noun="books"
        items={books.data?.items ?? []}
        renderItem={(book) => <BookCard book={book} tile={layout === 'grid'} />}
        columns={RESULTS_COLUMNS[layout]}
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
  const layout = useResultsLayout();

  return (
    <>
      <ResultsBar
        heading={
          <Typography.Title level={2} className={styles.heading}>
            {genre.name}
          </Typography.Title>
        }
      />

      <CardList
        noun="books"
        items={books.data?.items ?? []}
        renderItem={(book) => <BookCard book={book} tile={layout === 'grid'} />}
        columns={RESULTS_COLUMNS[layout]}
        isPending={books.isPending}
        isError={books.isError}
        error={books.error}
        emptyText="No books in this genre yet."
      />

      {/* Left out once it has loaded empty: an empty heading would only be
          noise under a page that already has its books. */}
      {!(series.isSuccess && series.data.items.length === 0) && (
        <>
          <Typography.Title level={3}>Series</Typography.Title>
          <CardList
            noun="series"
            items={series.data?.items ?? []}
            renderItem={(entry) => (
              <SeriesCard series={entry} linked tile={layout === 'grid'} />
            )}
            columns={RESULTS_COLUMNS[layout]}
            isPending={series.isPending}
            isError={series.isError}
            error={series.error}
          />
        </>
      )}
    </>
  );
};
