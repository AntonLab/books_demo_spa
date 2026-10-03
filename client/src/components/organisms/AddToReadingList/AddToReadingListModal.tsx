import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Flex,
  Input,
  Modal,
  Skeleton,
  Typography,
} from 'antd';
import { READING_LIST_TITLE_MAX_LENGTH } from 'shared';
import {
  useCreateReadingList,
  useMyReadingLists,
  useToggleListItem,
} from '@/queries/readingLists';
import type { WorkTarget } from '@/api/readingLists';

interface AddToReadingListModalProps {
  target: WorkTarget;
  onClose: () => void;
}

// Mounted only while open, so the lists are asked for only then.
export const AddToReadingListModal: FC<AddToReadingListModalProps> = ({
  target,
  onClose,
}) => {
  const lists = useMyReadingLists(target, true);
  const toggle = useToggleListItem(target);
  const create = useCreateReadingList();
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const error = create.error ?? toggle.error;

  const createAndAdd = async () => {
    setIsCreating(true);
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        description: '',
        tags: [],
      });
      await toggle.mutateAsync({ listId: created.id, itemId: null });
      setTitle('');
    } catch {
      // Shown through create.error or toggle.error.
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal open title="Add to reading list" footer={null} onCancel={onClose}>
      {lists.isPending && <Skeleton active paragraph={{ rows: 2 }} />}
      {lists.isError && (
        <Alert type="error" title="Could not load your reading lists." />
      )}
      {lists.data?.items.length === 0 && (
        <Typography.Paragraph type="secondary">
          You have no reading lists yet. Create one below.
        </Typography.Paragraph>
      )}
      <Flex vertical gap="small">
        {lists.data?.items.map((list) => (
          <Checkbox
            key={list.id}
            checked={list.itemId !== null}
            disabled={toggle.isPending}
            onChange={() =>
              toggle.mutate({ listId: list.id, itemId: list.itemId })
            }
          >
            {list.title}{' '}
            <Typography.Text type="secondary">
              ({list.itemCount})
            </Typography.Text>
          </Checkbox>
        ))}
      </Flex>
      {error && <Alert type="error" title={error.message} showIcon />}
      <Divider />
      <Flex gap="small">
        <Input
          aria-label="New list title"
          placeholder="New list"
          maxLength={READING_LIST_TITLE_MAX_LENGTH}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onPressEnter={() => void createAndAdd()}
        />
        <Button
          type="primary"
          disabled={title.trim() === '' || isCreating || toggle.isPending}
          loading={isCreating}
          onClick={() => void createAndAdd()}
        >
          Create and add
        </Button>
      </Flex>
    </Modal>
  );
};
