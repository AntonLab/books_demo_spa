import type { FC } from 'react';
import { Alert, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { SortableList } from '@/components/organisms/SortableList';
import { ApiError } from '@/api/client';
import { useChapters, useReorderChapters } from '@/queries/chapters';
import { formatDate } from '@/format/date';
import { chapterStateOf, type ChapterSummary } from '@/types/chapter';

// One row of the book's chapter list: a link to the chapter's editor, a badge
// for what is not out yet, and the date it came out or will.
const chapterRow = (bookId: number, chapter: ChapterSummary) => {
  const state = chapterStateOf(chapter);

  return (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space>
        <Link to={`/books/${bookId}/chapters/${chapter.id}/edit`}>
          {chapter.title}
        </Link>
        {state === 'draft' && <Tag>Draft</Tag>}
        {state === 'scheduled' && <Tag color="blue">Scheduled</Tag>}
      </Space>
      {chapter.publishedAt !== null && (
        <Typography.Text type="secondary">
          {formatDate(chapter.publishedAt)}
        </Typography.Text>
      )}
    </Space>
  );
};

interface ReadingOrderListProps {
  bookId: number;
  // Only a Co-author is offered "Add chapter": a Moderator may edit and delete
  // chapters but has no create on them.
  isCoAuthor: boolean;
}

// A book's chapters in Reading order (CONTEXT.md), with the save-on-drop that
// rewrites it. An organism: it owns the chapter list query and the reorder
// mutation.
export const ReadingOrderList: FC<ReadingOrderListProps> = ({
  bookId,
  isCoAuthor,
}) => {
  const { token } = theme.useToken();
  const chapters = useChapters(bookId);
  const reorder = useReorderChapters(bookId);

  const reorderConflict =
    reorder.error instanceof ApiError && reorder.error.status === 409;

  return (
    <>
      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        <Typography.Title level={4}>Chapters</Typography.Title>
        {/* Only a Co-author: a Moderator may edit and delete chapters but has
            no create on them. */}
        {isCoAuthor && (
          <Link to={`/books/${bookId}/chapters/new`}>Add chapter</Link>
        )}
      </Space>
      {/* A 409 has already brought in the current list; this says why the
          order just moved under the author's hands. */}
      {reorder.error && (
        <Alert
          type={reorderConflict ? 'warning' : 'error'}
          title={
            reorderConflict
              ? 'A co-author changed the chapters while you were reordering them. This is their current order.'
              : 'Could not save the new chapter order.'
          }
          style={{ marginBottom: token.margin }}
        />
      )}
      {/* Every chapter, drafts and scheduled ones included: the server returns
          them all to a Co-author or a Moderator, and this is where they are
          worked on and put in Reading order. */}
      <SortableList
        items={(chapters.data?.items ?? []).map((chapter) => ({
          id: chapter.id,
          label: chapter.title,
          content: chapterRow(bookId, chapter),
        }))}
        isPending={chapters.isPending}
        isError={chapters.isError}
        errorText="Could not load the chapters."
        emptyText="No chapters yet."
        onReorder={(chapterIds) => reorder.mutate(chapterIds)}
      />
    </>
  );
};
