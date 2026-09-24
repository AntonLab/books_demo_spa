import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Form } from 'antd';
import { NewPasswordFields } from './NewPasswordFields';
import { renderWithProviders } from '@/test/renderWithProviders';

const renderFields = (onFinish = jest.fn()) => {
  renderWithProviders(
    <Form onFinish={onFinish}>
      <NewPasswordFields label="New password" />
      <Button htmlType="submit">Save</Button>
    </Form>
  );
  return onFinish;
};

describe('NewPasswordFields', () => {
  it('renders the password under the given label beside its confirmation', () => {
    renderFields();

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('refuses a password shorter than 8 characters', async () => {
    const user = userEvent.setup();
    const onFinish = renderFields();

    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Password must be 8 to 128 characters')
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that differs', async () => {
    const user = userEvent.setup();
    const onFinish = renderFields();

    await user.type(screen.getByLabelText('New password'), 'hunter2hunter2');
    await user.type(
      screen.getByLabelText('Confirm password'),
      'hunter3hunter3'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('The two passwords do not match')
    ).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('submits a matching pair', async () => {
    const user = userEvent.setup();
    const onFinish = renderFields();

    await user.type(screen.getByLabelText('New password'), 'hunter2hunter2');
    await user.type(
      screen.getByLabelText('Confirm password'),
      'hunter2hunter2'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onFinish).toHaveBeenCalledWith({
        password: 'hunter2hunter2',
        confirm: 'hunter2hunter2',
      })
    );
  });
});
