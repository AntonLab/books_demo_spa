import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Input } from 'antd';
import { useEffect, useState } from 'react';
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

  it('opens one confirm however often close is pressed, and asks again once it is answered', async () => {
    const onClose = jest.fn();
    renderWithProviders(<Harness onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Name'), 'x');
    const closeIcon = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeIcon);
    await screen.findByRole('button', { name: 'Keep editing' });
    fireEvent.click(closeIcon);
    fireEvent.click(closeIcon);

    expect(document.querySelectorAll('.ant-modal-confirm')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(document.querySelectorAll('.ant-modal-confirm')).toHaveLength(0)
    );
    fireEvent.click(closeIcon);

    await screen.findByRole('button', { name: 'Keep editing' });
    expect(document.querySelectorAll('.ant-modal-confirm')).toHaveLength(1);
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

let setOpenerVisible: (visible: boolean) => void;
let setOpenerDisabled: (disabled: boolean) => void;

const FocusHarness: FC = () => {
  const [open, setOpen] = useState(false);
  const [openerVisible, setVisible] = useState(true);
  const [openerDisabled, setDisabled] = useState(false);
  useEffect(() => {
    setOpenerVisible = setVisible;
    setOpenerDisabled = setDisabled;
  }, []);
  return (
    <>
      {openerVisible && (
        <button disabled={openerDisabled} onClick={() => setOpen(true)}>
          Open
        </button>
      )}
      {open && (
        <DiscardGuardModal title="Dialog" onClose={() => setOpen(false)} />
      )}
    </>
  );
};

const openThenCancel = async (change: () => void) => {
  const user = userEvent.setup();
  renderWithProviders(<FocusHarness />);
  const opener = screen.getByRole('button', { name: 'Open' });
  act(() => opener.focus());
  await user.click(opener);
  const dialog = await screen.findByRole('dialog');
  act(change);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(dialog).not.toBeInTheDocument();
};

describe('DiscardGuardModal focus restore', () => {
  it('does nothing, and does not throw, when the opener left the DOM', async () => {
    await openThenCancel(() => setOpenerVisible(false));

    expect(document.body).toHaveFocus();
  });

  it('does not focus an opener that became disabled', async () => {
    await openThenCancel(() => setOpenerDisabled(true));

    expect(screen.getByRole('button', { name: 'Open' })).not.toHaveFocus();
  });
});
