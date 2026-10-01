import { useState } from 'react';
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
import { Link } from 'react-router';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { BookCreateModal } from '@/components/organisms/BookCreateModal/BookCreateModal';
import { CardList } from '@/components/organisms/CardList/CardList';
import { SeriesCreateModal } from '@/components/organisms/SeriesCreateModal/SeriesCreateModal';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { SeriesEditDetailsModal } from '@/components/organisms/SeriesEditDetailsModal/SeriesEditDetailsModal';
import { useSession } from '@/queries/auth';
import { useMyBooks } from '@/queries/books';
import { useMySeries } from '@/queries/series';
import { bookCapabilities, seriesCapabilities } from '@/types/capabilities';

interface Props {
  // Always an Account holding the author Role: the caller gates on it.
  authorId: number;
}

// Every book the author co-authors, in any status, and every series they
// co-author. The books come from `?userId=` naming the caller, which is the
// one book list the server widens to drafts; the series from the same filter
// on /api/series, which shows a Co-author their series even before it holds a
// published book.
export const MyBooksPanel: FC<Props> = ({ authorId }) => {
  const [creating, setCreating] = useState<'book' | 'series' | null>(null);
  const [editing, setEditing] = useState<{
    kind: 'book' | 'series';
    id: number;
  } | null>(null);
  const { data: session } = useSession();
  const books = useMyBooks(authorId);
  const series = useMySeries(authorId);

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
          <Flex justify="space-between" align="center" gap="small">
            <Space direction="vertical" size={0}>
              <Link to={`/series/${entry.id}/edit`}>{entry.title}</Link>
              <Typography.Text type="secondary">
                {entry.authors
                  .map((author) => `${author.firstName} ${author.lastName}`)
                  .join(', ')}
              </Typography.Text>
            </Space>
            {seriesCapabilities(entry, session).mayEdit && (
              <Button
                size="small"
                aria-label={`Edit ${entry.title}`}
                onClick={() => setEditing({ kind: 'series', id: entry.id })}
              >
                Edit
              </Button>
            )}
          </Flex>
        )}
      />
    );
  };

  return (
    <>
      <Tabs
        tabBarExtraContent={
          <Space>
            <Button type="primary" onClick={() => setCreating('book')}>
              Create book
            </Button>
            <Button onClick={() => setCreating('series')}>Create series</Button>
          </Space>
        }
        items={[
          {
            key: 'books',
            label: 'Books',
            children: (
              <CardList
                noun="books"
                items={books.data?.items ?? []}
                renderItem={(book) => (
                  <Flex vertical gap="small" align="flex-start">
                    <BookCard book={book} />
                    {bookCapabilities(book, session).mayEdit && (
                      <Button
                        size="small"
                        aria-label={`Edit ${book.title}`}
                        onClick={() =>
                          setEditing({ kind: 'book', id: book.id })
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </Flex>
                )}
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
            children: seriesTab(),
          },
        ]}
      />

      {creating === 'book' && (
        <BookCreateModal
          authorId={authorId}
          onClose={() => setCreating(null)}
        />
      )}
      {creating === 'series' && (
        <SeriesCreateModal onClose={() => setCreating(null)} />
      )}
      {editing?.kind === 'book' && (
        <BookEditDetailsModal
          bookId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'series' && (
        <SeriesEditDetailsModal
          seriesId={editing.id}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
