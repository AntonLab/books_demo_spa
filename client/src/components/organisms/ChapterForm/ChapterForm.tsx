import type { FC } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Space,
  TimePicker,
  theme,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { PublishedAtPayload } from '@/api/chapters';
import { chapterStateOf } from '@/types/chapter';

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
}

interface FieldValues {
  title: string;
  text: string;
  immediately: boolean;
  date?: Dayjs | null;
  time?: Dayjs | null;
}

// A day before today cannot be picked; today stays pickable, and the time
// picker below closes off the hours of it that have already gone.
const disabledDate = (day: Dayjs): boolean => day.isBefore(dayjs(), 'day');

const range = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index);

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
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm<FieldValues>();
  const state = chapterStateOf({ publishedAt });
  const scheduledFor = state === 'scheduled' ? dayjs(publishedAt) : null;

  const immediately =
    Form.useWatch('immediately', form) ?? scheduledFor === null;
  const pickedDate = Form.useWatch('date', form);

  // Only the hours and minutes of today that have passed are closed off; on
  // any later day every time is open.
  const disabledTime = () => {
    if (!pickedDate || !pickedDate.isSame(dayjs(), 'day')) return {};
    const now = dayjs();
    return {
      disabledHours: () => range(now.hour()),
      disabledMinutes: (hour: number) =>
        hour === now.hour() ? range(now.minute() + 1) : [],
    };
  };

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
        <Alert
          type="error"
          title={error}
          style={{ marginBottom: token.margin }}
        />
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
            <Typography.Paragraph type="secondary">
              {`Published on ${new Date(publishedAt ?? '').toLocaleString()}`}
            </Typography.Paragraph>
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
            <Form.Item name="immediately" valuePropName="checked">
              <Checkbox>Publish immediately</Checkbox>
            </Form.Item>

            {/* Rendered only while the checkbox is off, rather than hidden:
                an unmounted picker cannot hold a stale moment that a later
                Publish would quietly send. */}
            {!immediately && (
              <Space align="start" wrap>
                <Form.Item
                  name="date"
                  label="Publication date"
                  rules={[{ required: true, message: 'Pick a date' }]}
                >
                  <DatePicker
                    aria-label="Publication date"
                    format="YYYY-MM-DD"
                    disabledDate={disabledDate}
                  />
                </Form.Item>
                <Form.Item
                  name="time"
                  label="Publication time"
                  rules={[{ required: true, message: 'Pick a time' }]}
                >
                  <TimePicker
                    aria-label="Publication time"
                    format="HH:mm"
                    disabledTime={disabledTime}
                  />
                </Form.Item>
              </Space>
            )}

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
