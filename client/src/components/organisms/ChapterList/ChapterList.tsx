import type { FC } from 'react';
import { Alert, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router';
import { chapterStateOf, type ChapterSummary } from '@/types/chapter';

interface ChapterListProps {
  bookId: number;
  items: ChapterSummary[];
  isPending: boolean;
  isError: boolean;
  // The book edit page's list: each chapter links to its editor and carries a
  // Draft or Scheduled badge. The public list is filtered by its page to the
  // chapters that are out, so it never needs one.
  editable?: boolean;
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();

// Presentational, like BookList: the page owns the query and hands the states
// down, so this renders in a test with no network layer at all.
export const ChapterList: FC<ChapterListProps> = ({
  bookId,
  items,
  isPending,
  isError,
  editable = false,
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
      renderItem={(chapter) => {
        const state = chapterStateOf(chapter);
        const href = `/books/${bookId}/chapters/${chapter.id}`;

        return (
          <List.Item>
            <Space>
              <Link to={editable ? `${href}/edit` : href}>{chapter.title}</Link>
              {editable && state === 'draft' && <Tag>Draft</Tag>}
              {editable && state === 'scheduled' && (
                <Tag color="blue">Scheduled</Tag>
              )}
            </Space>
            {/* A reader's date is when the chapter came out; a Scheduled one
                shows when it will. A draft has neither. */}
            {chapter.publishedAt !== null && (
              <Typography.Text type="secondary">
                {formatDate(chapter.publishedAt)}
              </Typography.Text>
            )}
          </List.Item>
        );
      }}
    />
  );
};
