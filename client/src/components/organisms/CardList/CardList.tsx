import type { ReactNode } from 'react';
import { Alert, Col, Empty, Row, Skeleton } from 'antd';
import type { ColProps } from 'antd';

export interface CardListProps<T extends { id: number }> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  // What the list holds, plural ("books", "series"): it names the loading
  // state, the fallback error and the default empty text.
  noun: string;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  emptyText?: string;
  // Each item's `Col` spans; SearchPage's results layout sets them.
  columns?: ColProps;
}

const CARD_COLUMNS: ColProps = { xs: 24, sm: 12, lg: 8 };

// Presentational on purpose: each page runs its own query (`useBooks`,
// `useSearchBooks`, `useSeriesInGenre`…) and hands the states down. A
// component that ran the query itself could not serve them all.
//
// It takes TanStack's own flags rather than a `LoadStatus` string so there is
// one vocabulary for a load rather than two, and no page has to translate
// between them. Callers pass `data?.items ?? []`, so `items` is always an
// array and the empty branch never sees `undefined`.
//
// A function, not `FC`: `FC` cannot carry the type parameter.
export const CardList = <T extends { id: number }>({
  items,
  renderItem,
  noun,
  isPending,
  isError,
  error,
  emptyText = `No ${noun} yet.`,
  columns = CARD_COLUMNS,
}: CardListProps<T>) => {
  if (isError) {
    return (
      <Alert type="error" title={error?.message ?? `Could not load ${noun}`} />
    );
  }

  // `isPending`, not `isLoading`: the two differ for a query disabled by
  // `enabled: false`, which sits at `isPending: true` with `isLoading: false`.
  // "There is no data to render" is what the skeleton means, and that is
  // `isPending`.
  if (isPending) {
    return (
      <div role="status" aria-label={`Loading ${noun}`} aria-busy="true">
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  if (items.length === 0) {
    return <Empty description={emptyText} />;
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.id} {...columns}>
          {renderItem(item)}
        </Col>
      ))}
    </Row>
  );
};
