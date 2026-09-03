import { Alert, Col, Empty, Row, Skeleton } from 'antd';
import { BookCard } from './BookCard';
import type { LoadStatus } from '../../store/booksSlice';
import type { PublicBook } from '../../types/book';

export interface BookListProps {
  items: PublicBook[];
  status: LoadStatus;
  error: string | null;
  emptyText?: string;
}

// Presentational on purpose: MainPage feeds it from booksSlice and SearchPage
// from searchSlice. A component that selected from booksSlice itself could not
// serve both.
export function BookList({
  items,
  status,
  error,
  emptyText = 'No books yet.',
}: BookListProps) {
  if (status === 'error') {
    return <Alert type="error" title={error ?? 'Could not load books'} />;
  }

  if (status === 'idle' || status === 'loading') {
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
}
