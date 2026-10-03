import { useCallback, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { SortOrderSwitch } from '@/components/molecules/SortOrderSwitch/SortOrderSwitch';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { RESULTS_COLUMNS } from '@/components/organisms/ResultsLayoutSwitch/ResultsLayoutSwitch';
import { SeriesCard } from '@/components/organisms/SeriesCard/SeriesCard';
import { usePageClamp } from '@/components/organisms/ProfileWorksPanel/useProfileLists';
import { useBookSearch } from '@/queries/books';
import { useSeriesList } from '@/queries/series';
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
  renderCard: (row: T) => ReactNode;
}

// Never writes anything: only Published works are asked for, so the viewer's
// own Drafts stay out of their own public page.
const PublicListShell = <T extends { id: number }>({
  noun,
  emptyText,
  state,
  query,
  renderCard,
}: ShellProps<T>) => {
  const [, setSearchParams] = useSearchParams();
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
      <div className={spacing.gapBelow}>
        <SortOrderSwitch
          value={sort}
          onChange={(next) =>
            setSearchParams(
              toPublicListParams({ sort: next, page: 1, pageSize })
            )
          }
        />
      </div>
      <CardList
        noun={noun}
        items={query.data?.items ?? []}
        renderItem={(row) => (
          <div className={styles.card}>{renderCard(row)}</div>
        )}
        columns={RESULTS_COLUMNS.list}
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
      renderCard={(row) => <BookCard book={row} />}
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
