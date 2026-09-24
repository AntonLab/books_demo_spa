import { useEffect, useMemo, type FC } from 'react';
import { Alert, Empty, Flex, Pagination, Skeleton, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { SearchForm } from '@/components/organisms/SearchForm/SearchForm';
import { useBookSearch } from '@/queries/books';
import { useGenresWithBooks } from '@/queries/genres';
import { useAppSelector } from '@/store/hooks';
import {
  fieldErrorsOf,
  filterCount,
  formValuesOf,
  listParamsOf,
  parseBookSearch,
  searchOf,
  toSearchParams,
} from '@/types/bookSearch';
import styles from './SearchPage.module.css';

const GENRE_GONE = 'This genre no longer exists.';

const countOf = (total: number): string =>
  `${total} ${total === 1 ? 'book' : 'books'}`;

// The URL is the only source of the search: a Search, a page change, a
// reload, a pasted link and Back all read it the same way. Every field
// combines with the others by AND.
export const SearchPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = parseBookSearch(searchParams);
  const genres = useGenresWithBooks();
  const layout = useAppSelector(
    (state) => state.devicePreferences.resultsLayout
  );

  // A `genre` counts only once the list the select offers holds it: a
  // malformed id, an unknown one or one with no published Book is gone, and
  // no book is asked for until it is known either way.
  const genre =
    search.genre === undefined
      ? undefined
      : genres.data?.items.find((entry) => String(entry.id) === search.genre);
  const genreBlocked = search.genre !== undefined && genre === undefined;

  const books = useBookSearch(listParamsOf(search, genre?.id), !genreBlocked);
  const fieldErrors = useMemo(() => fieldErrorsOf(books.error), [books.error]);

  // Past the end the server serves its last non-empty page; the URL follows
  // it without a history entry of its own. While the genre is blocked the
  // query is disabled but still keyed with `genreId: undefined` — the same
  // key as the same search without a genre — so `served` can be a stale
  // `current` read back from that other search's cache entry rather than
  // anything this search asked for.
  const served = books.data?.current;
  useEffect(() => {
    if (genreBlocked || served === undefined || served === search.page) {
      return;
    }
    setSearchParams(
      toSearchParams({ ...parseBookSearch(searchParams), page: served }),
      { replace: true }
    );
  }, [genreBlocked, served, search.page, searchParams, setSearchParams]);

  return (
    <>
      <Typography.Title level={2}>Search results</Typography.Title>
      <SearchForm
        // antd reads initialValues once, so the form remounts whenever the
        // URL, or the Genre it resolves to, changes.
        key={`${searchParams.toString()}|${genre?.id ?? ''}`}
        initialValues={formValuesOf(search, genre?.id)}
        genres={genres.data?.items ?? []}
        filterCount={filterCount(search)}
        fieldErrors={fieldErrors}
        onSearch={(values) => setSearchParams(toSearchParams(searchOf(values)))}
        onReset={() => setSearchParams({})}
      />

      {genreBlocked ? (
        genres.isPending ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : genres.isError ? (
          <Alert type="error" title="Could not load the genres." />
        ) : (
          <Empty description={GENRE_GONE} />
        )
      ) : (
        <>
          <Flex
            justify="space-between"
            align="center"
            gap="middle"
            wrap
            className={styles.bar}
          >
            <Typography.Text>
              {books.isPending
                ? 'Searching…'
                : books.isError
                  ? 'Search failed'
                  : countOf(books.data.total)}
            </Typography.Text>
            <ResultsLayoutSwitch />
          </Flex>
          <CardList
            noun="books"
            items={books.data?.items ?? []}
            renderItem={(book) => (
              <BookCard book={book} tile={layout === 'grid'} />
            )}
            columns={RESULTS_COLUMNS[layout]}
            isPending={books.isPending}
            isError={books.isError}
            error={books.error}
            emptyText="No books match this search."
          />
          {books.data !== undefined && (
            <Pagination
              className={styles.pagination}
              align="center"
              current={books.data.current}
              pageSize={books.data.pageSize}
              total={books.data.total}
              showSizeChanger={false}
              hideOnSinglePage
              onChange={(page) =>
                setSearchParams(toSearchParams({ ...search, page }))
              }
            />
          )}
        </>
      )}
    </>
  );
};
