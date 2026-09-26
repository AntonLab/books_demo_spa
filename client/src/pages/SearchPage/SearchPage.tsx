import { useRef, useState, type FC } from 'react';
import { Alert, Empty, Flex, Pagination, Skeleton, Typography } from 'antd';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { SortOrderSwitch } from '@/components/molecules/SortOrderSwitch/SortOrderSwitch';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import {
  SearchFiltersToggle,
  SearchForm,
  type SearchFormHandle,
} from '@/components/organisms/SearchForm/SearchForm';
import { useAppSelector } from '@/store/hooks';
import spacing from '@/theme/spacing.module.css';
import styles from './SearchPage.module.css';
import { useSearchPage, type SearchBooks } from './useSearchPage';

const GENRE_GONE = 'This genre no longer exists.';
const FORM_ID = 'search-filters';

const countOf = (total: number): string =>
  `${total} ${total === 1 ? 'book' : 'books'}`;

// While a search runs the title keeps the count it last showed, so a Sort
// order pick or a page turn does not flash "Searching…" into it.
const countTextOf = (books: SearchBooks, lastTotal?: number): string =>
  books.isPending
    ? lastTotal === undefined
      ? 'Searching…'
      : countOf(lastTotal)
    : books.isError
      ? 'Search failed'
      : countOf(books.data.total);

export const SearchPage: FC = () => {
  const { filterCount, genres, sort, form, results } = useSearchPage();
  const formRef = useRef<SearchFormHandle>(null);
  const total =
    results.status === 'ready' ? results.books.data?.total : undefined;
  const [lastTotal, setLastTotal] = useState(total);
  if (total !== undefined && total !== lastTotal) setLastTotal(total);
  // React warns when `key` arrives inside a spread, so it goes on its own.
  const { key: formKey, ...formProps } = form;
  const layout = useAppSelector(
    (state) => state.devicePreferences.resultsLayout
  );
  const filtersExpanded = useAppSelector(
    (state) => state.devicePreferences.searchFormExpanded
  );

  return (
    <>
      <Typography.Title level={2}>
        {results.status === 'ready'
          ? `Search results · ${countTextOf(results.books, lastTotal)}`
          : 'Search results'}
      </Typography.Title>
      <Flex align="center" gap="middle" wrap className={spacing.gapBelow}>
        {results.status === 'ready' && (
          <SortOrderSwitch
            value={sort}
            onChange={(next) => formRef.current?.searchWith(next)}
          />
        )}
        <Flex gap="small" className={styles.toolbarEnd}>
          <SearchFiltersToggle controls={FORM_ID} filterCount={filterCount} />
          {results.status === 'ready' && <ResultsLayoutSwitch />}
        </Flex>
      </Flex>
      <div hidden={!filtersExpanded}>
        <SearchForm
          key={formKey}
          ref={formRef}
          {...formProps}
          id={FORM_ID}
          genres={genres}
        />
      </div>

      {results.status === 'ready' ? (
        <>
          <CardList
            noun="books"
            items={results.books.data?.items ?? []}
            renderItem={(book) => (
              <BookCard book={book} tile={layout === 'grid'} />
            )}
            columns={RESULTS_COLUMNS[layout]}
            isPending={results.books.isPending}
            isError={results.books.isError}
            error={results.books.error}
            emptyText="No books match this search."
          />
          {results.books.data !== undefined && (
            <Pagination
              className={styles.pagination}
              align="center"
              current={results.books.data.current}
              pageSize={results.books.data.pageSize}
              total={results.books.data.total}
              showSizeChanger={false}
              hideOnSinglePage
              onChange={results.goToPage}
            />
          )}
        </>
      ) : results.status === 'genre-loading' ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : results.status === 'genre-error' ? (
        <Alert type="error" title="Could not load the genres." />
      ) : (
        <Empty description={GENRE_GONE} />
      )}
    </>
  );
};
