import type { ReactNode } from 'react';
import { Alert, Col, Empty, Row, Skeleton } from 'antd';
import type { ColProps } from 'antd';

interface CardListProps<T extends { id: number }> {
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

// For `tile` cards: six to a row on a wide screen, two on a phone. Six start
// at `lg`, not `xl`: `appPageWidth` holds the page at 1024px up to a ~1365px
// window, so at `xl` tiles would shrink as the window widens past 1200.
export const TILE_COLUMNS: ColProps = { xs: 12, sm: 8, md: 6, lg: 4 };

// Presentational: each page runs its own query (`useSortedBooks`,
// `useBookSearch`, `useBooksInSeries`…) and hands the states down. It takes
// TanStack's own flags, not a `LoadStatus` string. Callers pass
// `data?.items ?? []`, so the empty branch never sees `undefined`.
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

  // `isPending`, not `isLoading`: a query disabled by `enabled: false` is
  // `isPending: true` with `isLoading: false`, and it has no data to render.
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
