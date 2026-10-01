import type { FC } from 'react';
import { Form, message } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { SeriesForm } from '@/components/organisms/SeriesForm/SeriesForm';
import type { SeriesFieldValues } from '@/components/organisms/SeriesForm/SeriesForm';
import { useGenres } from '@/queries/genres';
import { useCreateSeries } from '@/queries/series';

interface SeriesCreateModalProps {
  onClose: () => void;
}

// Mounted only while open, so each opening starts with an empty form.
export const SeriesCreateModal: FC<SeriesCreateModalProps> = ({ onClose }) => {
  const [form] = Form.useForm<SeriesFieldValues>();
  const genres = useGenres();
  const create = useCreateSeries();

  return (
    <DiscardGuardModal
      title="Create series"
      form={form}
      onClose={onClose}
      footer={null}
    >
      <SeriesForm
        form={form}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Create series"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: () => {
              onClose();
              // Fire-and-forget: the toast's promise settles when it closes.
              void message.success('Series created.');
            },
          })
        }
      />
    </DiscardGuardModal>
  );
};
