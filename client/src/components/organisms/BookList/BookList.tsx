import type { FC } from 'react';
import { Alert, Col, Empty, Row, Skeleton } from 'antd';
import { BookCard } from '@/components/organisms/BookCard';
import type { PublicBook } from '@/types/book';

export interface BookListProps {
  items: PublicBook[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  emptyText?: string;
}

// Presentational on purpose: MainPage feeds it from `useBooks` and SearchPage
// from `useSearchBooks`. A component that ran the query itself could not serve
// both.
//
// It takes TanStack's own flags rather than a `LoadStatus` string so there is
// one vocabulary for a load rather than two, and no page has to translate
// between them. Callers pass `data?.items ?? []`, so `items` is always an
// array and the empty branch never sees `undefined`.
export const BookList: FC<BookListProps> = ({
  items,
  isPending,
  isError,
  error,
  emptyText = 'No books yet.',
}) => {
  if (isError) {
    return (
      <Alert type="error" title={error?.message ?? 'Could not load books'} />
    );
  }

  // `isPending`, not `isLoading`: the two differ for a query disabled by
  // `enabled: false`, which sits at `isPending: true` with `isLoading: false`.
  // "There is no data to render" is what the skeleton means, and that is
  // `isPending`.
  if (isPending) {
    return (
      <div role="status" aria-label="Loading books" aria-busy="true">
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  if (items.length === 0) {
    return <Empty description={emptyText} />;
  }

  return (
    <Row gutter={[16, 16]}>
      {items.map((book) => (
        <Col key={book.id} xs={24} sm={12} lg={8}>
          <BookCard book={book} />
        </Col>
      ))}
    </Row>
  );
};
