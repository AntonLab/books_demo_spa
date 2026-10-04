import type { FC } from 'react';
import { Alert, Button, Form } from 'antd';
import type { FormInstance } from 'antd';
import { WorkFields } from '@/components/molecules/WorkFields/WorkFields';
import type { GenreListItem } from 'shared';
import spacing from '@/theme/spacing.module.css';

export interface SeriesFormValues {
  title: string;
  description: string;
  tags: string[];
  genreId: number | null;
}

interface SeriesFormProps {
  genreOptions: GenreListItem[];
  submitLabel: string;
  onSubmit: (values: SeriesFormValues) => void;
  initialValues?: SeriesFormValues;
  // A caller that needs the form's state, such as a modal asking before it
  // discards typed input, passes its own instance.
  form?: FormInstance<SeriesFieldValues>;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields. The form keeps its values while
  // it is on screen, because antd's Form holds them rather than the caller.
  error?: string | null;
}

// Cleared or untouched, Genre is undefined inside the form, like BookForm's.
export interface SeriesFieldValues extends Omit<SeriesFormValues, 'genreId'> {
  genreId?: number | null;
}

// Presentational, like BookForm: the page owns the mutation and the error, so
// creating and editing share the fields. A series has no status and belongs to
// no series, so it is WorkFields alone.
export const SeriesForm: FC<SeriesFormProps> = ({
  genreOptions,
  submitLabel,
  onSubmit,
  initialValues,
  form,
  isSubmitting = false,
  error = null,
}) => {
  const handleFinish = ({ genreId, ...rest }: SeriesFieldValues) => {
    onSubmit({
      ...rest,
      tags: rest.tags ?? [],
      genreId: genreId ?? null,
    });
  };

  return (
    <>
      {error !== null && (
        <Alert type="error" title={error} className={spacing.gapBelow} />
      )}

      <Form<SeriesFieldValues>
        form={form}
        layout="vertical"
        initialValues={{
          tags: [],
          ...initialValues,
          genreId: initialValues?.genreId ?? undefined,
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
