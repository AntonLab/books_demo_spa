import type { FC, ReactNode } from 'react';
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
import { Alert, Button, Empty, Flex, Skeleton, theme } from 'antd';
import styles from './SortableList.module.css';

export interface SortableListItem {
  id: number;
  // What the item is called to someone who cannot see the list: its drag
  // handle's name and every announcement.
  label: string;
  // The rest of the row, beside the handle.
  content: ReactNode;
}

interface SortableListProps {
  items: SortableListItem[];
  isPending: boolean;
  isError: boolean;
  errorText: string;
  emptyText: string;
  // The whole new order, first item first. Called only when a drop actually
  // moved an item.
  onReorder: (ids: number[]) => void;
}

const SortableRow: FC<{ item: SortableListItem }> = ({ item }) => {
  const { token } = theme.useToken();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      // What src/test/sortable.ts lays out in jsdom, which measures nothing.
      data-sortable-row
      className={`${styles.row} ${isDragging ? styles.dragging : ''}`}
      // dnd-kit recomputes these on every pointer move, so they cannot be a
      // class.
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Flex align="center" gap={token.marginXS}>
        {/* The handle alone starts a drag, so the links and buttons in the row
            keep working. A text glyph, like LikeButton's: @ant-design/icons is
            not a dependency here. */}
        <Button
          ref={setActivatorNodeRef}
          type="text"
          size="small"
          aria-label={`Reorder ${item.label}`}
          className={styles.handle}
          {...attributes}
          {...listeners}
        >
          ⠿
        </Button>
        <div className={styles.content}>{item.content}</div>
      </Flex>
    </li>
  );
};

// A list the user puts in order by drag and drop or from the keyboard (Space to
// pick an item up, the arrow keys to move it, Space to drop it, Escape to
// cancel). Presentational: the page owns the query, the save and what each row
// shows — a book's chapters in Reading order, a series' books in Series order —
// and no position number is ever shown.
export const SortableList: FC<SortableListProps> = ({
  items,
  isPending,
  isError,
  errorText,
  emptyText,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (isError) return <Alert type="error" title={errorText} />;
  if (isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (items.length === 0) return <Empty description={emptyText} />;

  const labelOf = (id: UniqueIdentifier | undefined): string =>
    items.find((item) => item.id === id)?.label ?? 'the item';

  // Spoken by label rather than dnd-kit's default ids, which mean nothing to a
  // listener.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} is over ${labelOf(over.id)}.`
        : `${labelOf(active.id)} is no longer over another item.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} was dropped at ${labelOf(over.id)}.`
        : `${labelOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    onReorder(
      arrayMove(
        items.map((item) => item.id),
        from,
        to
      )
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className={styles.list}>
          {items.map((item) => (
            <SortableRow key={item.id} item={item} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
};
