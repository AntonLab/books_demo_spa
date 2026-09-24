import type { FC } from 'react';
import { Alert, Button, Form } from 'antd';
import {
  NO_GENRE,
  WorkFields,
} from '@/components/molecules/WorkFields/WorkFields';
import type { PublicGenre } from 'shared';
import styles from './SeriesForm.module.css';

interface SeriesFormValues {
  title: string;
  description: string;
  tags: string[];
  genreId: number | null;
}

interface SeriesFormProps {
  genreOptions: PublicGenre[];
  submitLabel: string;
  onSubmit: (values: SeriesFormValues) => void;
  initialValues?: SeriesFormValues;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields. The form keeps its values while
  // it is on screen, because antd's Form holds them rather than the caller.
  error?: string | null;
}

interface FieldValues extends Omit<SeriesFormValues, 'genreId'> {
  genreId: number;
}

// Presentational, like BookForm: the page that renders it owns the mutation
// and the error, so creating and editing share one set of fields. A series has
// no status and belongs to no series, so it is WorkFields alone.
export const SeriesForm: FC<SeriesFormProps> = ({
  genreOptions,
  submitLabel,
  onSubmit,
  initialValues,
  isSubmitting = false,
  error = null,
}) => {
  const handleFinish = ({ genreId, ...rest }: FieldValues) => {
    onSubmit({
      ...rest,
      tags: rest.tags ?? [],
      genreId: genreId === NO_GENRE ? null : genreId,
    });
  };

  return (
    <>
      {error !== null && (
        <Alert type="error" title={error} className={styles.error} />
      )}

      <Form<FieldValues>
        layout="vertical"
        initialValues={{
          tags: [],
          ...initialValues,
          genreId: initialValues?.genreId ?? NO_GENRE,
        }}
        onFinish={handleFinish}
      >
        <WorkFields genreOptions={genreOptions} />

        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </Form>
    </>
  );
};
