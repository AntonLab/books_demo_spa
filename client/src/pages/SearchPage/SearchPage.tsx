import type { FC } from 'react';
import { Alert, Empty, Flex, Pagination, Skeleton, Typography } from 'antd';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import {
  SearchFiltersToggle,
  SearchForm,
} from '@/components/organisms/SearchForm/SearchForm';
import { useAppSelector } from '@/store/hooks';
import spacing from '@/theme/spacing.module.css';
import styles from './SearchPage.module.css';
import { useSearchPage, type SearchBooks } from './useSearchPage';

const GENRE_GONE = 'This genre no longer exists.';
const FORM_ID = 'search-filters';

const countOf = (total: number): string =>
  `${total} ${total === 1 ? 'book' : 'books'}`;

const countTextOf = (books: SearchBooks): string =>
  books.isPending
    ? 'Searching…'
    : books.isError
      ? 'Search failed'
      : countOf(books.data.total);

export const SearchPage: FC = () => {
  const { filterCount, genres, form, results } = useSearchPage();
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
      <Typography.Title level={2}>Search results</Typography.Title>
      <Flex
        justify="space-between"
        align="center"
        gap="middle"
        wrap
        className={spacing.gapBelow}
      >
        <Typography.Text>
          {results.status === 'ready' ? countTextOf(results.books) : null}
        </Typography.Text>
        <Flex gap="small">
          <SearchFiltersToggle controls={FORM_ID} filterCount={filterCount} />
          {results.status === 'ready' && <ResultsLayoutSwitch />}
        </Flex>
      </Flex>
      <div hidden={!filtersExpanded}>
        <SearchForm key={formKey} {...formProps} id={FORM_ID} genres={genres} />
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
