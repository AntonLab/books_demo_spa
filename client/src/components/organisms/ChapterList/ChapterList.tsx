import type { FC } from 'react';
import { Alert, Empty, List, Skeleton, Typography } from 'antd';
import { Link } from 'react-router';
import type { ChapterSummary } from '@/types/chapter';

interface ChapterListProps {
  bookId: number;
  items: ChapterSummary[];
  isPending: boolean;
  isError: boolean;
}

// Presentational, like BookList: the page owns the query and hands the states
// down, so this renders in a test with no network layer at all.
export const ChapterList: FC<ChapterListProps> = ({
  bookId,
  items,
  isPending,
  isError,
}) => {
  if (isError) {
    return <Alert type="error" message="Could not load the chapters." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (items.length === 0) return <Empty description="No chapters yet." />;

  return (
    <List
      dataSource={items}
      renderItem={(chapter) => (
        <List.Item>
          <Link to={`/books/${bookId}/chapters/${chapter.id}`}>
            {chapter.title}
          </Link>
          <Typography.Text type="secondary">
            {new Date(chapter.createdAt).toLocaleDateString()}
          </Typography.Text>
        </List.Item>
      )}
    />
  );
};
