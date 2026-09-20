import type { FC } from 'react';
import { Alert, Button, Form, Input, Select, theme } from 'antd';
import type { PublicGenre } from '@/types/genre';

export interface SeriesFormValues {
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

// As in BookForm: a select cannot hold `null` as an option value, so "No
// genre" travels as 0 inside the form and becomes null on the way out.
const NO_GENRE = 0;

interface FieldValues extends Omit<SeriesFormValues, 'genreId'> {
  genreId: number;
}

// Presentational, like BookForm: the page that renders it owns the mutation
// and the error, so creating and editing share one set of fields. A series has
// no status and belongs to no series, so it is BookForm's fields minus those
// two rather than BookForm with switches.
export const SeriesForm: FC<SeriesFormProps> = ({
  genreOptions,
  submitLabel,
  onSubmit,
  initialValues,
  isSubmitting = false,
  error = null,
}) => {
  const { token } = theme.useToken();

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
        <Alert
          type="error"
          title={error}
          style={{ marginBottom: token.margin }}
        />
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
        <Form.Item
          name="title"
          label="Title"
          rules={[
            { required: true, whitespace: true, message: 'Enter a title' },
          ]}
        >
          <Input maxLength={255} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Enter a description',
            },
          ]}
        >
          <Input.TextArea rows={4} maxLength={5000} />
        </Form.Item>

        <Form.Item name="tags" label="Tags">
          <Select mode="tags" aria-label="Tags" tokenSeparators={[',']} />
        </Form.Item>

        <Form.Item name="genreId" label="Genre">
          <Select
            aria-label="Genre"
            options={[
              { value: NO_GENRE, label: 'No genre' },
              ...genreOptions.map((genre) => ({
                value: genre.id,
                label: genre.name,
              })),
            ]}
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </Form>
    </>
  );
};
