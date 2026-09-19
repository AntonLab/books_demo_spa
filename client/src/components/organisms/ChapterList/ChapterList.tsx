import type { FC } from 'react';
import { Alert, Empty, List, Skeleton, Typography } from 'antd';
import { Link } from 'react-router';
import { formatDate } from '@/format/date';
import type { ChapterSummary } from '@/types/chapter';

interface ChapterListProps {
  bookId: number;
  items: ChapterSummary[];
  isPending: boolean;
  isError: boolean;
}

// Presentational, like BookList: the page owns the query and hands the states
// down, so this renders in a test with no network layer at all. The reader's
// list: its page passes only the chapters that are out, in Reading order. The
// book editor's list, with badges and drag and drop, is a SortableList.
export const ChapterList: FC<ChapterListProps> = ({
  bookId,
  items,
  isPending,
  isError,
}) => {
  if (isError) {
    return <Alert type="error" title="Could not load the chapters." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (items.length === 0) return <Empty description="No chapters yet." />;

  return (
    <List
      dataSource={items}
      rowKey="id"
      renderItem={(chapter) => (
        <List.Item>
          <Link to={`/books/${bookId}/chapters/${chapter.id}`}>
            {chapter.title}
          </Link>
          {/* A reader's date is when the chapter came out. */}
          {chapter.publishedAt !== null && (
            <Typography.Text type="secondary">
              {formatDate(chapter.publishedAt)}
            </Typography.Text>
          )}
        </List.Item>
      )}
    />
  );
};
