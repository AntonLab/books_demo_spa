import type { FC } from 'react';
import { Alert, Button, Form, Input, Select, theme } from 'antd';

export interface SeriesFormValues {
  title: string;
  description: string;
  tags: string[];
}

interface SeriesFormProps {
  submitLabel: string;
  onSubmit: (values: SeriesFormValues) => void;
  initialValues?: SeriesFormValues;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields. The form keeps its values while
  // it is on screen, because antd's Form holds them rather than the caller.
  error?: string | null;
}

// Presentational, like BookForm: the page that renders it owns the mutation
// and the error, so creating and editing share one set of fields. A series has
// no status and belongs to no series, so it is BookForm's fields minus those
// two rather than BookForm with switches.
export const SeriesForm: FC<SeriesFormProps> = ({
  submitLabel,
  onSubmit,
  initialValues,
  isSubmitting = false,
  error = null,
}) => {
  const { token } = theme.useToken();

  return (
    <>
      {error !== null && (
        <Alert
          type="error"
          title={error}
          style={{ marginBottom: token.margin }}
        />
      )}

      <Form<SeriesFormValues>
        layout="vertical"
        initialValues={{ tags: [], ...initialValues }}
        onFinish={(values) => onSubmit({ ...values, tags: values.tags ?? [] })}
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

        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </Form>
    </>
  );
};
