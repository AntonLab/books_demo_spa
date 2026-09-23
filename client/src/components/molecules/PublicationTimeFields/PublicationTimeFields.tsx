import { Checkbox, DatePicker, Form, Space, TimePicker } from 'antd';
import type { FormInstance } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

// The Publication time (CONTEXT.md) half of a chapter's form. Declared here
// rather than in the parent so the parent's own FieldValues can extend it and
// the form instance typechecks at the boundary.
export interface PublicationTimeValues {
  immediately: boolean;
  date?: Dayjs | null;
  time?: Dayjs | null;
}

// Generic over the parent's own value type rather than taking a plain
// FormInstance<PublicationTimeValues>: antd's FormInstance is invariant in it
// (setFields accepts FieldData<Values>), so a parent whose FieldValues merely
// extends this one could not pass its instance without a cast.
interface PublicationTimeFieldsProps<Values extends PublicationTimeValues> {
  // The one Form instance the parent drives. These Form.Items must sit inside
  // that same <Form>, and the watches below read its store: a second instance
  // would leave the parent's submit reading nothing.
  form: FormInstance<Values>;
  // What the parent put in initialValues.immediately. Form.useWatch reports
  // undefined until the field registers, and this is the answer for that first
  // render.
  defaultImmediately: boolean;
}

// A day before today cannot be picked; today stays pickable, and the time
// picker below closes off the hours of it that have already gone.
const disabledDate = (day: Dayjs): boolean => day.isBefore(dayjs(), 'day');

const range = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index);

// Presentational: no query hook, no api call — the parent owns submission.
export const PublicationTimeFields = <Values extends PublicationTimeValues>({
  form,
  defaultImmediately,
}: PublicationTimeFieldsProps<Values>) => {
  const immediately = Form.useWatch('immediately', form) ?? defaultImmediately;
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

  return (
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
    </>
  );
};
