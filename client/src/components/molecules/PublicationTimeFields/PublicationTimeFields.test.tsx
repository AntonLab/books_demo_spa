import type { FC } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  PublicationTimeFields,
  type PublicationTimeValues,
} from './PublicationTimeFields';
import { renderWithProviders } from '@/test/renderWithProviders';

// The parent's job, in miniature: one Form instance, handed both to <Form> and
// to the fields under test. ChapterForm does exactly this.
const Harness: FC<{ scheduledFor?: Dayjs | null }> = ({
  scheduledFor = null,
}) => {
  const [form] = Form.useForm<PublicationTimeValues>();

  return (
    <Form<PublicationTimeValues>
      form={form}
      layout="vertical"
      initialValues={{
        immediately: scheduledFor === null,
        date: scheduledFor,
        time: scheduledFor,
      }}
    >
      <PublicationTimeFields
        form={form}
        defaultImmediately={scheduledFor === null}
      />
    </Form>
  );
};

describe('PublicationTimeFields', () => {
  it('publishes immediately by default, with no moment to pick', () => {
    renderWithProviders(<Harness />);

    expect(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    ).toBeChecked();
    expect(screen.queryByLabelText('Publication date')).toBeNull();
    expect(screen.queryByLabelText('Publication time')).toBeNull();
  });

  it('reveals the pickers only while the checkbox is off', async () => {
    renderWithProviders(<Harness />);
    const checkbox = screen.getByRole('checkbox', {
      name: 'Publish immediately',
    });

    await userEvent.click(checkbox);
    expect(screen.getByLabelText('Publication date')).toBeInTheDocument();
    expect(screen.getByLabelText('Publication time')).toBeInTheDocument();

    await userEvent.click(checkbox);
    expect(screen.queryByLabelText('Publication date')).toBeNull();
    expect(screen.queryByLabelText('Publication time')).toBeNull();
  });

  it('shows a scheduled moment straight away, unticked', () => {
    const moment = dayjs()
      .add(3, 'day')
      .hour(18)
      .minute(30)
      .second(0)
      .millisecond(0);
    renderWithProviders(<Harness scheduledFor={moment} />);

    expect(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    ).not.toBeChecked();
    expect(screen.getByLabelText('Publication date')).toHaveValue(
      moment.format('YYYY-MM-DD')
    );
    expect(screen.getByLabelText('Publication time')).toHaveValue('18:30');
  });

  it('takes a day still to come and refuses one that has gone', async () => {
    renderWithProviders(<Harness />);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    );
    const dateInput = screen.getByLabelText('Publication date');

    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    await userEvent.type(dateInput, `${tomorrow}{enter}`);
    expect(dateInput).toHaveValue(tomorrow);

    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, `${yesterday}{enter}`);
    expect(dateInput).not.toHaveValue(yesterday);
  });
});
