import type { FC } from 'react';
import { Alert, Button, Flex, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router';
import { SortableList } from '@/components/organisms/SortableList/SortableList';
import { ApiError } from '@/api/client';
import {
  useReadingListItems,
  useRemoveReadingListItem,
  useReorderReadingListItems,
} from '@/queries/readingLists';
import type { ReadingListEditItem } from '@/types/readingList';
import spacing from '@/theme/spacing.module.css';

interface ReadingListItemsListProps {
  listId: number;
  // Passed in rather than derived here: the items query stays disabled until
  // the modal knows the viewer owns the list.
  mayEdit: boolean;
}

const UNAVAILABLE = 'Unavailable item';

const itemLabel = (item: ReadingListEditItem) => {
  if (item.kind === 'book') return item.book.title;
  if (item.kind === 'series') return item.series.title;
  return UNAVAILABLE;
};

export const ReadingListItemsList: FC<ReadingListItemsListProps> = ({
  listId,
  mayEdit,
}) => {
  const items = useReadingListItems(listId, mayEdit);
  const reorder = useReorderReadingListItems(listId);
  const remove = useRemoveReadingListItem(listId);

  const reorderConflict =
    reorder.error instanceof ApiError && reorder.error.status === 409;

  // An item the viewer may not see is named, never titled or linked: only
  // Remove is left.
  const itemRow = (item: ReadingListEditItem) => (
    <Flex justify="space-between" align="center" gap="small">
      <Space wrap>
        {item.kind === 'book' && (
          <>
            <Link to={`/books/${item.book.id}`}>{item.book.title}</Link>
            <Tag>Book</Tag>
          </>
        )}
        {item.kind === 'series' && (
          <>
            <Link to={`/series/${item.series.id}`}>{item.series.title}</Link>
            <Tag>Series</Tag>
          </>
        )}
        {item.kind === 'unavailable' && (
          <Typography.Text type="secondary">{UNAVAILABLE}</Typography.Text>
        )}
      </Space>
      <Button
        size="small"
        loading={remove.isPending && remove.variables === item.id}
        onClick={() => remove.mutate(item.id)}
      >
        Remove
      </Button>
    </Flex>
  );

  return (
    <>
      {reorder.error && (
        <Alert
          type={reorderConflict ? 'warning' : 'error'}
          title={
            reorderConflict
              ? 'The items of this reading list changed while you were reordering them. This is their current order.'
              : reorder.error.message
          }
          className={spacing.gapBelow}
        />
      )}
      {remove.error && (
        <Alert
          type="error"
          title={remove.error.message}
          className={spacing.gapBelow}
        />
      )}
      <SortableList
        items={(items.data?.items ?? []).map((item) => ({
          id: item.id,
          label: itemLabel(item),
          content: itemRow(item),
        }))}
        isPending={items.isPending}
        isError={items.isError}
        errorText="Could not load the items of this reading list."
        emptyText="No items yet. Add a Book or Series from its page."
        onReorder={(itemIds) => reorder.mutate(itemIds)}
      />
    </>
  );
};
