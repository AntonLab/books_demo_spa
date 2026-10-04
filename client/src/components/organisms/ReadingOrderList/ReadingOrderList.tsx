import type { FC } from 'react';
import { Alert, Button, Flex, Space, Tag } from 'antd';
import { SortableList } from '@/components/organisms/SortableList/SortableList';
import { ApiError } from '@/api/client';
import { useChapters, useReorderChapters } from '@/queries/chapters';
import { isBlank, unsavedTextKeys } from '@/store/unsavedTextSlice';
import { useUnsavedText } from '@/store/useUnsavedText';
import { ChapterRow } from './ChapterRow';
import spacing from '@/theme/spacing.module.css';

interface ReadingOrderListProps {
  bookId: number;
  // Only a Co-author is offered "Add chapter": a Moderator may edit and delete
  // chapters but has no create on them.
  isCoAuthor: boolean;
  onAdd: () => void;
  onEdit: (chapterId: number) => void;
}

export const ReadingOrderList: FC<ReadingOrderListProps> = ({
  bookId,
  isCoAuthor,
  onAdd,
  onEdit,
}) => {
  const chapters = useChapters(bookId);
  const reorder = useReorderChapters(bookId);
  const { entry: newChapter } = useUnsavedText(
    unsavedTextKeys.chapterNew(bookId)
  );

  const reorderConflict =
    reorder.error instanceof ApiError && reorder.error.status === 409;

  return (
    <>
      {isCoAuthor && (
        <Flex justify="flex-end" className={spacing.gapBelow}>
          <Space>
            {newChapter && !isBlank(newChapter) && (
              <Tag color="orange">Unsaved changes</Tag>
            )}
            <Button size="small" onClick={onAdd}>
              Add chapter
            </Button>
          </Space>
        </Flex>
      )}
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
          className={spacing.gapBelow}
        />
      )}
      {/* Every chapter, drafts and scheduled ones included: the server returns
          them all to a Co-author or a Moderator, and this is where they are
          worked on and put in Reading order. */}
      <SortableList
        items={(chapters.data?.items ?? []).map((chapter) => ({
          id: chapter.id,
          label: chapter.title,
          content: (
            <ChapterRow
              bookId={bookId}
              chapter={chapter}
              onEdit={() => onEdit(chapter.id)}
            />
          ),
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
