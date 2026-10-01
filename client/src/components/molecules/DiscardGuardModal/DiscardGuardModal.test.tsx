import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Input } from 'antd';
import type { FC } from 'react';
import { DiscardGuardModal } from './DiscardGuardModal';
import { renderWithProviders } from '@/test/renderWithProviders';

const Harness: FC<{ onClose: () => void; withForm?: boolean }> = ({
  onClose,
  withForm = true,
}) => {
  const [form] = Form.useForm();
  return (
    <DiscardGuardModal
      title="Edit thing"
      form={withForm ? form : undefined}
      onClose={onClose}
      footer={null}
    >
      <Form form={form}>
        <Form.Item name="name" label="Name">
          <Input />
        </Form.Item>
      </Form>
    </DiscardGuardModal>
  );
};

const pressEscape = () =>
  fireEvent.keyDown(screen.getByRole('dialog'), {
    key: 'Escape',
    keyCode: 27,
  });

describe('DiscardGuardModal', () => {
  it('closes at once when nothing was touched', () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} />);

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('asks before closing a touched form, via the close icon', async () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // antd's confirm renders its title twice, so the text matches more than once.
    expect(await screen.findAllByText('Discard changes?')).not.toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks on Escape too, and closes once discard is confirmed', async () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    pressEscape();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Discard' })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the form and its text when the user keeps editing', async () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    pressEscape();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep editing' })
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('x');
  });

  it('still asks when a field was changed back to its first value', async () => {
    renderWithProviders(<Harness onClose={jest.fn()} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    await userEvent.clear(screen.getByLabelText('Name'));
    pressEscape();

    expect(await screen.findAllByText('Discard changes?')).not.toHaveLength(0);
  });

  it('closes at once when it was given no form', async () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} withForm={false} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
