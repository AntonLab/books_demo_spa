import type { FC } from 'react';
import { Alert, App, Form, Skeleton } from 'antd';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { SeriesForm } from '@/components/organisms/SeriesForm/SeriesForm';
import type {
  SeriesFieldValues,
  SeriesFormValues,
} from '@/components/organisms/SeriesForm/SeriesForm';
import { useSession } from '@/queries/auth';
import { useGenres } from '@/queries/genres';
import { useSeries, useUpdateSeries } from '@/queries/series';
import { seriesCapabilities } from '@/types/capabilities';

interface SeriesEditDetailsModalProps {
  seriesId: number;
  onClose: () => void;
}

// Mounted only while open. It loads the series itself (cached when a page
// already holds it), and hands the form to the discard guard only once the form
// is on screen, so closing while loading or after a failed load closes at once.
export const SeriesEditDetailsModal: FC<SeriesEditDetailsModalProps> = ({
  seriesId,
  onClose,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<SeriesFieldValues>();
  const { data: session } = useSession();
  const { data: series, isPending, isError } = useSeries(seriesId);
  const genres = useGenres();
  const update = useUpdateSeries(seriesId);

  const showsForm =
    series !== undefined &&
    session != null &&
    seriesCapabilities(series, session).mayEdit;

  const handleSubmit = (values: SeriesFormValues) => {
    update.mutate(values, {
      onSuccess: () => {
        onClose();
        // Fire-and-forget: the toast's promise settles when it closes.
        void message.success('Series saved.');
      },
    });
  };

  const renderBody = () => {
    if (isError) {
      return <Alert type="error" title="Could not load this series." />;
    }
    if (isPending) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (!showsForm) {
      return (
        <Alert
          type="warning"
          title="Only its co-authors can edit this series."
        />
      );
    }

    return (
      <SeriesForm
        form={form}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Save"
        initialValues={{
          title: series.title,
          description: series.description,
          tags: series.tags,
          genreId: series.genre?.id ?? null,
        }}
        isSubmitting={update.isPending}
        error={update.error?.message ?? null}
        onSubmit={handleSubmit}
      />
    );
  };

  return (
    <DiscardGuardModal
      title="Edit series details"
      form={showsForm ? form : undefined}
      onClose={onClose}
      footer={null}
    >
      {renderBody()}
    </DiscardGuardModal>
  );
};
