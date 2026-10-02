import type { FC } from 'react';
import { Alert, App, Button, Form, Popconfirm, Skeleton, Tabs } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { ReadingListForm } from '@/components/organisms/ReadingListForm/ReadingListForm';
import type { ReadingListFormValues } from '@/components/organisms/ReadingListForm/ReadingListForm';
import { ReadingListItemsList } from './ReadingListItemsList';
import { useSession } from '@/queries/auth';
import {
  useDeleteReadingList,
  useReadingList,
  useUpdateReadingList,
} from '@/queries/readingLists';
import { readingListCapabilities } from '@/types/capabilities';
import spacing from '@/theme/spacing.module.css';

interface ReadingListEditModalProps {
  listId: number;
  onClose: () => void;
  // Runs after onClose, once the owner deleted the list.
  onGone?: () => void;
}

// Mounted only while open. It loads the list itself (cached when a page
// already holds it), and hands the form to the discard guard only once the form
// is on screen, so closing while loading or after a failed load closes at once.
export const ReadingListEditModal: FC<ReadingListEditModalProps> = ({
  listId,
  onClose,
  onGone,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReadingListFormValues>();
  const { data: session } = useSession();
  const { data: list, isPending, isError } = useReadingList(listId);
  const update = useUpdateReadingList(listId);
  const remove = useDeleteReadingList(listId);

  const mayEdit =
    list !== undefined &&
    readingListCapabilities(list, session ?? null).mayEdit;

  const handleSubmit = (values: ReadingListFormValues) => {
    update.mutate(values, {
      onSuccess: () => {
        onClose();
        // Fire-and-forget: the toast's promise settles when it closes.
        void message.success('Reading list saved.');
      },
    });
  };

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        onClose();
        void message.success('Reading list deleted.');
        onGone?.();
      },
    });
  };

  const renderBody = () => {
    if (isError) {
      return <Alert type="error" title="Could not load this reading list." />;
    }
    if (isPending) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (!mayEdit) {
      return (
        <Alert
          type="warning"
          title="Only the owner can edit this reading list."
        />
      );
    }

    // No destroyOnHidden: the Details pane stays mounted, so typed values and
    // the discard guard survive a tab switch.
    return (
      <Tabs
        items={[
          {
            key: 'details',
            label: 'Details',
            children: (
              <>
                <ReadingListForm
                  form={form}
                  submitLabel="Save"
                  initialValues={{
                    title: list.title,
                    description: list.description,
                    tags: list.tags,
                  }}
                  isSubmitting={update.isPending}
                  error={update.error?.message ?? null}
                  onSubmit={handleSubmit}
                />
                {remove.error && (
                  <Alert
                    type="error"
                    title={remove.error.message}
                    className={spacing.gapBelow}
                  />
                )}
                <Popconfirm
                  title="Delete this reading list?"
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={handleDelete}
                >
                  <Button danger loading={remove.isPending}>
                    Delete reading list
                  </Button>
                </Popconfirm>
              </>
            ),
          },
          {
            key: 'items',
            label: 'Items',
            children: (
              <ReadingListItemsList listId={listId} mayEdit={mayEdit} />
            ),
          },
        ]}
      />
    );
  };

  return (
    <DiscardGuardModal
      title="Edit reading list"
      form={mayEdit ? form : undefined}
      onClose={onClose}
      footer={null}
    >
      {renderBody()}
    </DiscardGuardModal>
  );
};
