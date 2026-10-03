import type { FC } from 'react';
import { App, Form } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { ReadingListForm } from '@/components/organisms/ReadingListForm/ReadingListForm';
import type { ReadingListFormValues } from '@/components/organisms/ReadingListForm/ReadingListForm';
import { useCreateReadingList } from '@/queries/readingLists';
import type { PublicReadingList } from '@/types/readingList';

interface ReadingListCreateModalProps {
  onClose: () => void;
  onCreated?: (list: PublicReadingList) => void;
}

// Mounted only while open, so each opening starts with an empty form.
export const ReadingListCreateModal: FC<ReadingListCreateModalProps> = ({
  onClose,
  onCreated,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReadingListFormValues>();
  const create = useCreateReadingList();

  return (
    <DiscardGuardModal
      title="Create reading list"
      form={form}
      onClose={onClose}
      footer={null}
    >
      <ReadingListForm
        form={form}
        submitLabel="Create reading list"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: (list) => {
              onClose();
              // Fire-and-forget: the toast's promise settles when it closes.
              void message.success('Reading list created.');
              onCreated?.(list);
            },
          })
        }
      />
    </DiscardGuardModal>
  );
};
