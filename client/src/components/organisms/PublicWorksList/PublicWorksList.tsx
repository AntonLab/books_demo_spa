import { Flex } from 'antd';
import { useCallback, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { SortOrderSwitch } from '@/components/molecules/SortOrderSwitch/SortOrderSwitch';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import {
  RESULTS_COLUMNS,
  ResultsLayoutSwitch,
} from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { SeriesCard } from '@/components/organisms/SeriesCard/SeriesCard';
import { usePageClamp } from '@/components/organisms/ProfileWorksPanel/useProfileLists';
import { useBookSearch } from '@/queries/books';
import { useSeriesList } from '@/queries/series';
import { useResultsLayout } from '@/store/hooks';
import spacing from '@/theme/spacing.module.css';
import {
  parsePublicList,
  toPublicListParams,
  type PublicListState,
} from '@/types/publicProfileLists';
import styles from '../ProfileWorksPanel/ProfileWorksPanel.module.css';

interface Query<T> {
  data: { items: T[]; total: number } | undefined;
  isPending: boolean;
  error: Error | null;
}

interface ShellProps<T extends { id: number }> {
  noun: 'books' | 'series';
  emptyText: string;
  state: PublicListState;
  query: Query<T>;
  renderCard: (row: T, tile: boolean) => ReactNode;
  layoutAware: boolean;
}

// Never writes anything: only Published works are asked for, so the viewer's
// own Drafts stay out of their own public page.
const PublicListShell = <T extends { id: number }>({
  noun,
  emptyText,
  state,
  query,
  renderCard,
  layoutAware,
}: ShellProps<T>) => {
  const [, setSearchParams] = useSearchParams();
  const layout = useResultsLayout();
  const columns = layoutAware ? RESULTS_COLUMNS[layout] : RESULTS_COLUMNS.list;
  const tile = layoutAware && layout === 'grid';
  const { sort, page, pageSize } = state;

  const moveTo = useCallback(
    (last: number) =>
      setSearchParams(toPublicListParams({ sort, page: last, pageSize }), {
        replace: true,
      }),
    [setSearchParams, sort, pageSize]
  );
  const overshooting = usePageClamp(
    { page, pageSize, total: query.data?.total },
    moveTo
  );
  const isPending = query.isPending || overshooting;

  return (
    <>
      <Flex align="center" gap="middle" wrap className={spacing.gapBelow}>
        <SortOrderSwitch
          value={sort}
          onChange={(next) =>
            setSearchParams(
              toPublicListParams({ sort: next, page: 1, pageSize })
            )
          }
        />
        {layoutAware && (
          <div className={styles.toolbarEnd}>
            <ResultsLayoutSwitch />
          </div>
        )}
      </Flex>
      <CardList
        noun={noun}
        items={query.data?.items ?? []}
        renderItem={(row) => (
          <div className={styles.card}>{renderCard(row, tile)}</div>
        )}
        columns={columns}
        isPending={isPending}
        isError={query.error !== null}
        error={query.error}
        emptyText={emptyText}
      />
      {!isPending && query.error === null && (
        <ListPagination
          className={styles.pagination}
          current={page}
          pageSize={pageSize}
          total={query.data?.total ?? 0}
          onChange={(nextPage, nextSize) =>
            setSearchParams(
              toPublicListParams({
                sort,
                page: nextPage,
                pageSize: nextSize,
              })
            )
          }
        />
      )}
    </>
  );
};

const PublicBooksView: FC<{ userId: number }> = ({ userId }) => {
  const [searchParams] = useSearchParams();
  const state = parsePublicList(searchParams);
  const query = useBookSearch(
    {
      userId,
      published: 'true',
      sort: state.sort,
      current: state.page,
      pageSize: state.pageSize,
    },
    true
  );
  return (
    <PublicListShell
      noun="books"
      emptyText="No books yet."
      state={state}
      query={query}
      renderCard={(row, tile) => <BookCard book={row} tile={tile} />}
      layoutAware
    />
  );
};

const PublicSeriesView: FC<{ userId: number }> = ({ userId }) => {
  const [searchParams] = useSearchParams();
  const state = parsePublicList(searchParams);
  const query = useSeriesList(
    {
      userId,
      published: 'true',
      sort: state.sort,
      limit: state.pageSize,
      offset: (state.page - 1) * state.pageSize,
    },
    true
  );
  return (
    <PublicListShell
      noun="series"
      emptyText="No series yet."
      state={state}
      query={query}
      renderCard={(row) => (
        <SeriesCard series={row} href={`/series/${row.id}`} />
      )}
      layoutAware={false}
    />
  );
};

export const PublicWorksList: FC<{
  kind: 'books' | 'series';
  userId: number;
}> = ({ kind, userId }) =>
  kind === 'books' ? (
    <PublicBooksView userId={userId} />
  ) : (
    <PublicSeriesView userId={userId} />
  );
