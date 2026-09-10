import type { FC } from 'react';
import { Alert, Skeleton, Space, theme, Typography } from 'antd';
import { Link, useParams } from 'react-router';
import { useChapter, useChapters } from '@/queries/chapters';

export const ChapterPage: FC = () => {
  const { token } = theme.useToken();
  const { bookId, chapterId } = useParams();
  const book = Number(bookId);
  const id = Number(chapterId);

  // The same cache key BookPage already filled, so arriving from the book page
  // costs no request: only the body below is fetched here.
  const { data: list } = useChapters(book);
  const { data: chapter, isPending, isError } = useChapter(id);

  if (isError) {
    return <Alert type="error" message="Could not load this chapter." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // Navigation is derived from the chapter's position in the list rather than
  // from an id arithmetic: chapter ids are not contiguous once one is deleted.
  const items = list?.items ?? [];
  const index = items.findIndex((item) => item.id === id);
  const previous = index > 0 ? items[index - 1] : undefined;
  const next =
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;

  return (
    <article>
      <Link to={`/books/${book}`}>Back to the book</Link>

      <Typography.Title level={2}>{chapter.title}</Typography.Title>

      {/* The body is authored text, so its line breaks are content rather than
          markup and are preserved instead of collapsed. */}
      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
        {chapter.text}
      </Typography.Paragraph>

      <Space size={token.marginSM}>
        {previous && (
          <Link to={`/books/${book}/chapters/${previous.id}`}>Previous</Link>
        )}
        {next && <Link to={`/books/${book}/chapters/${next.id}`}>Next</Link>}
      </Space>
    </article>
  );
};
