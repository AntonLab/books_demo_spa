import { act, fireEvent, screen } from '@testing-library/react';
import { Form } from 'antd';
import { ClearableSelect } from './ClearableSelect';
import { renderWithProviders } from '@/test/renderWithProviders';

const renderHarness = (onChange: (value: number | undefined) => void) =>
  renderWithProviders(
    <Form
      initialValues={{ series: 2 }}
      onValuesChange={(changed: { series?: number }) =>
        onChange(changed.series)
      }
    >
      <Form.Item name="series">
        <ClearableSelect
          aria-label="Series"
          options={[
            { value: 1, label: 'Saga' },
            { value: 2, label: 'Trilogy' },
          ]}
        />
      </Form.Item>
    </Form>
  );

describe('ClearableSelect', () => {
  it.each([
    ['Delete', 46],
    ['Backspace', 8],
  ])('%s clears a closed select and keeps it closed', (key, code) => {
    const onChange = jest.fn();
    renderHarness(onChange);
    const box = screen.getByRole('combobox', { name: 'Series' });
    act(() => box.focus());
    jest.useFakeTimers();
    try {
      // rc-select reads `which`, which user-event does not set.
      fireEvent.keyDown(box, { key, which: code, keyCode: code });
      expect(onChange).toHaveBeenLastCalledWith(undefined);
      // rc-select opens on a macrotask; run every pending timer.
      act(() => jest.runAllTimers());
      expect(box).toHaveAttribute('aria-expanded', 'false');
    } finally {
      jest.useRealTimers();
    }
  });
});
