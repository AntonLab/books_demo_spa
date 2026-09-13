import type { FC } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Alert,
  Button,
  Empty,
  Flex,
  Skeleton,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd';
import { Link } from 'react-router';
import { chapterStateOf, type ChapterSummary } from '@/types/chapter';

interface SortableChapterListProps {
  bookId: number;
  items: ChapterSummary[];
  isPending: boolean;
  isError: boolean;
  // The whole new Reading order, first chapter first. Called only when a drop
  // actually moved a chapter.
  onReorder: (chapterIds: number[]) => void;
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();

interface RowProps {
  bookId: number;
  chapter: ChapterSummary;
}

const SortableChapterRow: FC<RowProps> = ({ bookId, chapter }) => {
  const { token } = theme.useToken();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });
  const state = chapterStateOf(chapter);

  return (
    <li
      ref={setNodeRef}
      // What src/test/sortable.ts lays out in jsdom, which measures nothing.
      data-sortable-row
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        background: token.colorBgContainer,
        boxShadow: isDragging ? token.boxShadowSecondary : undefined,
        padding: `${token.paddingSM}px 0`,
        borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}`,
      }}
    >
      <Flex align="center" justify="space-between" gap={token.marginSM}>
        <Space>
          {/* The handle alone starts a drag, so the title stays an ordinary
              link. A text glyph, like LikeButton's: @ant-design/icons is not
              a dependency here. */}
          <Button
            ref={setActivatorNodeRef}
            type="text"
            size="small"
            aria-label={`Reorder ${chapter.title}`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            {...attributes}
            {...listeners}
          >
            ⠿
          </Button>
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
      </Flex>
    </li>
  );
};

// The book editor's chapter list: every chapter, badged by state, in Reading
// order, and sortable by drag and drop or from the keyboard (Space to pick a
// chapter up, the arrow keys to move it, Space to drop it, Escape to cancel).
// Presentational like ChapterList — the page owns the query and the save —
// and, like it, never shows a position number.
export const SortableChapterList: FC<SortableChapterListProps> = ({
  bookId,
  items,
  isPending,
  isError,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (isError) {
    return <Alert type="error" title="Could not load the chapters." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (items.length === 0) return <Empty description="No chapters yet." />;

  const titleOf = (id: UniqueIdentifier | undefined): string =>
    items.find((chapter) => chapter.id === id)?.title ?? 'the chapter';

  // Spoken by titles rather than dnd-kit's default ids, which mean nothing to
  // a listener.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} is over ${titleOf(over.id)}.`
        : `${titleOf(active.id)} is no longer over a chapter.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} was dropped at ${titleOf(over.id)}.`
        : `${titleOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const ids = items.map((chapter) => chapter.id);
    const from = items.findIndex((chapter) => chapter.id === active.id);
    const to = items.findIndex((chapter) => chapter.id === over.id);
    if (from === -1 || to === -1) return;

    onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((chapter) => chapter.id)}
        strategy={verticalListSortingStrategy}
      >
        {/* An ordered list for its meaning; the markers are hidden because the
            Reading order is shown by place, never by number. */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((chapter) => (
            <SortableChapterRow
              key={chapter.id}
              bookId={bookId}
              chapter={chapter}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
};
