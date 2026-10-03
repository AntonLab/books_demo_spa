import type { FC } from 'react';
import { Alert, Button, Form, Radio } from 'antd';
import type { FormInstance } from 'antd';
import { ClearableSelect } from '@/components/molecules/ClearableSelect/ClearableSelect';
import { WorkFields } from '@/components/molecules/WorkFields/WorkFields';
import { BOOK_STATUSES } from 'shared';
import { BOOK_STATUS_LABELS } from '@/types/book';
import type { GenreListItem, BookStatus } from 'shared';
import spacing from '@/theme/spacing.module.css';

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
  genreOptions: GenreListItem[];
  submitLabel: string;
  onSubmit: (values: BookFormValues) => void;
  initialValues?: BookFormValues;
  // A caller that needs the form's state, such as a modal asking before it
  // discards typed input, passes its own instance.
  form?: FormInstance<BookFieldValues>;
  // Off when creating: the server makes every new book a draft whatever the
  // body says, so offering a choice there would only be ignored.
  showStatus?: boolean;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields. The form keeps its values while
  // it is on screen, because antd's Form holds them rather than the caller.
  error?: string | null;
}

// A cleared or untouched select is undefined inside the form; it leaves as an
// explicit null, so an edit can unset it.
export interface BookFieldValues extends Omit<
  BookFormValues,
  'seriesId' | 'genreId'
> {
  seriesId?: number | null;
  genreId?: number | null;
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
  form,
  showStatus = false,
  isSubmitting = false,
  error = null,
}) => {
  const handleFinish = ({
    seriesId,
    genreId,
    status,
    ...rest
  }: BookFieldValues) => {
    onSubmit({
      ...rest,
      tags: rest.tags ?? [],
      seriesId: seriesId ?? null,
      genreId: genreId ?? null,
      ...(showStatus && status !== undefined ? { status } : {}),
    });
  };

  return (
    <>
      {error !== null && (
        <Alert type="error" title={error} className={spacing.gapBelow} />
      )}

      <Form<BookFieldValues>
        form={form}
        layout="vertical"
        initialValues={{
          tags: [],
          ...initialValues,
          // A select shows its placeholder only for undefined, not null.
          seriesId: initialValues?.seriesId ?? undefined,
          genreId: initialValues?.genreId ?? undefined,
        }}
        onFinish={handleFinish}
      >
        <WorkFields genreOptions={genreOptions}>
          <Form.Item name="seriesId" label="Series">
            <ClearableSelect
              aria-label="Series"
              placeholder="No series"
              options={seriesOptions.map((series) => ({
                value: series.id,
                label: series.title,
              }))}
            />
          </Form.Item>
        </WorkFields>

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
