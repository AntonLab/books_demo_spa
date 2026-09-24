import type { FC } from 'react';
import {
  Alert,
  Button,
  Empty,
  Flex,
  Listy,
  Skeleton,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { Link, useNavigate } from 'react-router';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { CardList } from '@/components/organisms/CardList/CardList';
import { useSession } from '@/queries/auth';
import { useMyBooks } from '@/queries/books';
import { useMySeries } from '@/queries/series';
import styles from './MyBooksPage.module.css';

// Every book the signed-in author co-authors, in any status, and every series
// they co-author. The books come from `?userId=` naming the caller, which is
// the one book list the server widens to drafts; the series from the same
// filter on /api/series, which shows a Co-author their series even before it
// holds a published book.
export const MyBooksPage: FC = () => {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isAuthor = session?.role === 'author';
  const books = useMyBooks(isAuthor ? session.id : undefined);
  const series = useMySeries(isAuthor ? session.id : undefined);

  if (!isAuthor) {
    return (
      <>
        <Typography.Title level={2}>My Books</Typography.Title>
        <Alert
          type="info"
          title="Books are kept here for accounts holding the author role."
        />
      </>
    );
  }

  const seriesTab = () => {
    if (series.isError) {
      return <Alert type="error" title="Could not load your series." />;
    }
    if (series.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
    if (series.data.items.length === 0) {
      return <Empty description="You have not started a series yet." />;
    }

    return (
      <Listy
        items={series.data.items}
        rowKey="id"
        itemRender={(entry) => (
          <Space direction="vertical" size={0}>
            <Link to={`/series/${entry.id}/edit`}>{entry.title}</Link>
            <Typography.Text type="secondary">
              {entry.authors
                .map((author) => `${author.firstName} ${author.lastName}`)
                .join(', ')}
            </Typography.Text>
          </Space>
        )}
      />
    );
  };

  return (
    <>
      <Flex justify="space-between" align="center" gap="small">
        <Typography.Title level={2}>My Books</Typography.Title>
        <Button type="primary" onClick={() => void navigate('/books/new')}>
          Create book
        </Button>
      </Flex>

      <Tabs
        items={[
          {
            key: 'books',
            label: 'Books',
            children: (
              <CardList
                noun="books"
                items={books.data?.items ?? []}
                renderItem={(book) => <BookCard book={book} />}
                isPending={books.isPending}
                isError={books.isError}
                error={books.error}
                emptyText="You have not written a book yet."
              />
            ),
          },
          {
            key: 'series',
            label: 'Series',
            children: (
              <>
                <Flex justify="flex-end" className={styles.toolbar}>
                  <Button onClick={() => void navigate('/series/new')}>
                    Create series
                  </Button>
                </Flex>
                {seriesTab()}
              </>
            ),
          },
        ]}
      />
    </>
  );
};
