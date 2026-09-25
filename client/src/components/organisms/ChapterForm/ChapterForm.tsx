import type { FC } from 'react';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  PublicationTimeFields,
  type PublicationTimeValues,
} from '@/components/molecules/PublicationTimeFields/PublicationTimeFields';
import type { PublishedAtPayload } from '@/api/chapters';
import { formatDateTime } from '@/format/date';
import { chapterStateOf } from '@/types/chapter';
import spacing from '@/theme/spacing.module.css';

export interface ChapterFormValues {
  title: string;
  text: string;
  // Absent when a Published chapter is saved as it is: leaving the Publication
  // time out is the only way to edit one without a 400.
  publishedAt?: PublishedAtPayload;
}

interface ChapterFormProps {
  onSubmit: (values: ChapterFormValues) => void;
  initialValues?: { title: string; text: string };
  // The chapter's current Publication time, when editing one. It decides which
  // controls the form offers: a Published chapter's moment is fixed.
  publishedAt?: string | null;
  isSubmitting?: boolean;
  error?: string | null;
  // Every user edit of the title or the text, for keeping Unsaved text. The
  // Publication time controls are left out on purpose: a stale moment could
  // publish a Chapter when nobody means it any more.
  onValuesChange?: (values: { title: string; text: string }) => void;
}

interface FieldValues extends PublicationTimeValues {
  title: string;
  text: string;
}

// The picked day and time as one moment in the browser's own time zone, sent
// on as a UTC instant.
const momentOf = (date: Dayjs, time: Dayjs): Dayjs =>
  date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0);

export const ChapterForm: FC<ChapterFormProps> = ({
  onSubmit,
  initialValues,
  publishedAt = null,
  isSubmitting = false,
  error = null,
  onValuesChange,
}) => {
  const [form] = Form.useForm<FieldValues>();
  const state = chapterStateOf({ publishedAt });
  const scheduledFor = state === 'scheduled' ? dayjs(publishedAt) : null;

  const submitWith = async (
    mode: 'publish' | 'draft' | 'keep'
  ): Promise<void> => {
    // A draft needs no moment, so only publishing validates the pickers.
    const names: (keyof FieldValues)[] =
      mode === 'publish' && !form.getFieldValue('immediately')
        ? ['title', 'text', 'date', 'time']
        : ['title', 'text'];

    let values: FieldValues;
    try {
      values = await form.validateFields(names);
    } catch {
      return;
    }
    const { title, text } = values;

    if (mode === 'keep') {
      onSubmit({ title, text });
      return;
    }
    if (mode === 'draft') {
      onSubmit({ title, text, publishedAt: null });
      return;
    }
    if (form.getFieldValue('immediately')) {
      onSubmit({ title, text, publishedAt: 'now' });
      return;
    }

    const date = form.getFieldValue('date') as Dayjs;
    const time = form.getFieldValue('time') as Dayjs;
    const moment = momentOf(date, time);
    // The server refuses a past moment too; checking here keeps the answer
    // next to the pickers instead of in an error above the form.
    if (!moment.isAfter(dayjs())) {
      form.setFields([
        { name: 'time', errors: ['Choose a moment in the future'] },
      ]);
      return;
    }
    onSubmit({ title, text, publishedAt: moment.toISOString() });
  };

  return (
    <>
      {error !== null && (
        <Alert type="error" title={error} className={spacing.gapBelow} />
      )}

      <Form<FieldValues>
        form={form}
        layout="vertical"
        initialValues={{
          title: initialValues?.title ?? '',
          text: initialValues?.text ?? '',
          immediately: scheduledFor === null,
          date: scheduledFor,
          time: scheduledFor,
        }}
        onValuesChange={(changed: Partial<FieldValues>, all: FieldValues) => {
          if ('title' in changed || 'text' in changed) {
            onValuesChange?.({ title: all.title, text: all.text });
          }
        }}
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
          name="text"
          label="Text"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Enter the chapter text',
            },
          ]}
        >
          <Input.TextArea rows={16} />
        </Form.Item>

        {state === 'published' ? (
          <>
            {/* A Published chapter always has a moment; the check narrows
                the type, and keeps Intl from throwing on an empty string. */}
            {publishedAt !== null && (
              <Typography.Paragraph type="secondary">
                {`Published on ${formatDateTime(publishedAt)}`}
              </Typography.Paragraph>
            )}
            <Space>
              <Button
                type="primary"
                loading={isSubmitting}
                onClick={() => void submitWith('keep')}
              >
                Save
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => void submitWith('draft')}
              >
                Return to draft
              </Button>
            </Space>
          </>
        ) : (
          <>
            <PublicationTimeFields
              form={form}
              defaultImmediately={scheduledFor === null}
            />

            <Space>
              <Button
                type="primary"
                loading={isSubmitting}
                onClick={() => void submitWith('publish')}
              >
                Publish
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => void submitWith('draft')}
              >
                Save draft
              </Button>
            </Space>
          </>
        )}
      </Form>
    </>
  );
};
