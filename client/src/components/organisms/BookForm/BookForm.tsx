import type { FC } from 'react';
import { Alert, Button, Form, Input, Radio, Select } from 'antd';
import {
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  type BookStatus,
} from '@/types/book';
import type { PublicGenre } from '@/types/genre';
import styles from './BookForm.module.css';

export interface BookFormValues {
  title: string;
  description: string;
  tags: string[];
  seriesId: number | null;
  genreId: number | null;
  // Present only when the form shows it: a new book has no status to choose.
  status?: BookStatus;
}

interface BookFormProps {
  seriesOptions: { id: number; title: string }[];
  genreOptions: PublicGenre[];
  submitLabel: string;
  onSubmit: (values: BookFormValues) => void;
  initialValues?: BookFormValues;
  // Off when creating: the server makes every new book a draft whatever the
  // body says, so offering a choice there would only be ignored.
  showStatus?: boolean;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields. The form keeps its values while
  // it is on screen, because antd's Form holds them rather than the caller.
  error?: string | null;
}

// A select cannot hold `null` as an option value and stay clearable, so "No
// series" travels as 0 inside the form and becomes null on the way out. "No
// genre" works the same way.
const NO_SERIES = 0;
const NO_GENRE = 0;

interface FieldValues extends Omit<BookFormValues, 'seriesId' | 'genreId'> {
  seriesId: number;
  genreId: number;
}

// Presentational: it neither fetches nor saves. The page that renders it owns
// the series list, the mutation and the error, so creating and editing share
// one set of fields.
export const BookForm: FC<BookFormProps> = ({
  seriesOptions,
  genreOptions,
  submitLabel,
  onSubmit,
  initialValues,
  showStatus = false,
  isSubmitting = false,
  error = null,
}) => {
  const handleFinish = ({
    seriesId,
    genreId,
    status,
    ...rest
  }: FieldValues) => {
    onSubmit({
      ...rest,
      tags: rest.tags ?? [],
      seriesId: seriesId === NO_SERIES ? null : seriesId,
      genreId: genreId === NO_GENRE ? null : genreId,
      ...(showStatus && status !== undefined ? { status } : {}),
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
          seriesId: initialValues?.seriesId ?? NO_SERIES,
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

        <Form.Item name="seriesId" label="Series">
          <Select
            aria-label="Series"
            options={[
              { value: NO_SERIES, label: 'No series' },
              ...seriesOptions.map((series) => ({
                value: series.id,
                label: series.title,
              })),
            ]}
          />
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

        {showStatus && (
          <Form.Item name="status" label="Status">
            <Radio.Group
              optionType="button"
              options={BOOK_STATUSES.map((status) => ({
                value: status,
                label: BOOK_STATUS_LABELS[status],
              }))}
            />
          </Form.Item>
        )}

        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </Form>
    </>
  );
};
