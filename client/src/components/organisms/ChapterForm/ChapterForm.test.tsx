import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { ChapterForm } from './ChapterForm';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDateTime } from '@/format/date';

const filled = { title: 'Chapter One', text: 'It was a dark night.' };

describe('ChapterForm', () => {
  it('publishes immediately by default, with no date or time to pick', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ChapterForm initialValues={filled} onSubmit={onSubmit} />
    );

    expect(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    ).toBeChecked();
    expect(screen.queryByLabelText('Publication date')).toBeNull();
    expect(screen.queryByLabelText('Publication time')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ ...filled, publishedAt: 'now' })
    );
  });

  it('reveals the date and time pickers only while the checkbox is off', async () => {
    renderWithProviders(
      <ChapterForm initialValues={filled} onSubmit={jest.fn()} />
    );
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

  it('saves a draft whatever the checkbox says', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ChapterForm initialValues={filled} onSubmit={onSubmit} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ ...filled, publishedAt: null })
    );
  });

  it('keeps a scheduled chapter scheduled for the moment it was set to', async () => {
    const onSubmit = jest.fn();
    const moment = dayjs()
      .add(3, 'day')
      .hour(18)
      .minute(30)
      .second(0)
      .millisecond(0);
    renderWithProviders(
      <ChapterForm
        initialValues={filled}
        publishedAt={moment.toISOString()}
        onSubmit={onSubmit}
      />
    );

    expect(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    ).not.toBeChecked();
    expect(screen.getByLabelText('Publication date')).toHaveValue(
      moment.format('YYYY-MM-DD')
    );
    expect(screen.getByLabelText('Publication time')).toHaveValue('18:30');

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...filled,
        publishedAt: moment.toISOString(),
      })
    );
  });

  it('will not take a day that has already gone', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ChapterForm initialValues={filled} onSubmit={onSubmit} />
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    );

    // The picker disables past days, so a typed one is not accepted at all.
    const dateInput = screen.getByLabelText('Publication date');
    await userEvent.type(
      dateInput,
      `${dayjs().subtract(2, 'day').format('YYYY-MM-DD')}{enter}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Pick a date')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a scheduled moment that passed while the form was open', async () => {
    // Only the clock is faked, so the scheduled moment can pass between the
    // render and the click without the test racing a real one; the timers
    // userEvent and antd rely on stay real.
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'hrtime',
        'performance',
      ],
    });
    try {
      const onSubmit = jest.fn();
      const tenMinutesOn = dayjs().add(10, 'minute').second(0).millisecond(0);
      renderWithProviders(
        <ChapterForm
          initialValues={filled}
          publishedAt={tenMinutesOn.toISOString()}
          onSubmit={onSubmit}
        />
      );

      jest.setSystemTime(tenMinutesOn.add(5, 'minute').toDate());
      await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

      expect(
        await screen.findByText('Choose a moment in the future')
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for a date and a time before scheduling', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ChapterForm initialValues={filled} onSubmit={onSubmit} />
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Pick a date')).toBeInTheDocument();
    expect(screen.getByText('Pick a time')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('edits a published chapter without touching its publication time', async () => {
    const onSubmit = jest.fn();
    const published = '2026-09-01T12:00:00.000Z';
    renderWithProviders(
      <ChapterForm
        initialValues={filled}
        publishedAt={published}
        onSubmit={onSubmit}
      />
    );

    expect(
      screen.getByText(`Published on ${formatDateTime(published)}`)
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(filled));

    await userEvent.click(
      screen.getByRole('button', { name: 'Return to draft' })
    );
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        ...filled,
        publishedAt: null,
      })
    );
  });

  it('refuses to save without a title or a text', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(<ChapterForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Enter the chapter text')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server error above the fields', () => {
    renderWithProviders(
      <ChapterForm
        initialValues={filled}
        error="A publication time cannot be in the past"
        onSubmit={jest.fn()}
      />
    );

    expect(
      screen.getByText('A publication time cannot be in the past')
    ).toBeInTheDocument();
  });

  it('reports edits of title and text, not of the publication controls', async () => {
    const onValuesChange = jest.fn();
    renderWithProviders(
      <ChapterForm
        initialValues={filled}
        onSubmit={jest.fn()}
        onValuesChange={onValuesChange}
      />
    );

    await userEvent.type(screen.getByLabelText('Title'), '!');
    expect(onValuesChange).toHaveBeenLastCalledWith({
      title: 'Chapter One!',
      text: 'It was a dark night.',
    });

    onValuesChange.mockClear();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Publish immediately' })
    );
    expect(onValuesChange).not.toHaveBeenCalled();
  });
});
