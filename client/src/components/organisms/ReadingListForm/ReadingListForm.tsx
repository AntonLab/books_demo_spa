import type { FC } from 'react';
import { Alert, Button, Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import {
  READING_LIST_TITLE_MAX_LENGTH,
  WORK_DESCRIPTION_MAX_LENGTH,
} from 'shared';
import spacing from '@/theme/spacing.module.css';

export interface ReadingListFormValues {
  title: string;
  description: string;
  tags: string[];
}

interface ReadingListFormProps {
  submitLabel: string;
  onSubmit: (values: ReadingListFormValues) => void;
  initialValues?: ReadingListFormValues;
  // A caller that needs the form's state, such as a modal asking before it
  // discards typed input, passes its own instance.
  form?: FormInstance<ReadingListFormValues>;
  isSubmitting?: boolean;
  // A server refusal, shown above the fields.
  error?: string | null;
}

// Its own Form rather than WorkFields: a Reading list has no Genre and its
// Description is optional.
export const ReadingListForm: FC<ReadingListFormProps> = ({
  submitLabel,
  onSubmit,
  initialValues,
  form,
  isSubmitting = false,
  error = null,
}) => (
  <>
    {error !== null && (
      <Alert type="error" title={error} className={spacing.gapBelow} />
    )}

    <Form<ReadingListFormValues>
      form={form}
      layout="vertical"
      initialValues={{ tags: [], description: '', ...initialValues }}
      onFinish={(values) =>
        onSubmit({
          ...values,
          description: values.description ?? '',
          tags: values.tags ?? [],
        })
      }
    >
      <Form.Item
        name="title"
        label="Title"
        rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}
      >
        <Input maxLength={READING_LIST_TITLE_MAX_LENGTH} />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <Input.TextArea rows={4} maxLength={WORK_DESCRIPTION_MAX_LENGTH} />
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
