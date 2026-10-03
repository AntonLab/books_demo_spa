import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportCommentModal } from './ReportCommentModal';

const setup = (
  props: Partial<ComponentProps<typeof ReportCommentModal>> = {}
) => {
  const onSubmit = jest.fn();
  render(
    <ReportCommentModal
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      pending={false}
      error={null}
      {...props}
    />
  );
  return {
    onSubmit,
    send: screen.getByRole('button', { name: /Send report/ }),
  };
};

describe('ReportCommentModal', () => {
  it('offers the four reasons and disables Send until one is picked', () => {
    const { send } = setup();
    expect(
      screen.getAllByRole('radio').map((r) => r.getAttribute('value'))
    ).toEqual(['spam', 'harassment', 'spoilers', 'other']);
    expect(send).toBeDisabled();
  });

  it('sends a bare reason for Spam', async () => {
    const { onSubmit, send } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    await userEvent.click(send);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam' })
    );
  });

  it('asks for a capped explanation under Other only, and keeps Send disabled while it is blank', async () => {
    const { send } = setup();
    expect(screen.queryByLabelText('Explanation')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Other' }));
    expect(screen.getByLabelText('Explanation')).toHaveAttribute(
      'maxlength',
      '500'
    );
    await userEvent.type(screen.getByLabelText('Explanation'), '   ');
    expect(send).toBeDisabled();
  });

  it('sends the trimmed explanation under Other', async () => {
    const { onSubmit, send } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Other' }));
    await userEvent.type(screen.getByLabelText('Explanation'), '  Off topic ');
    await userEvent.click(send);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        reason: 'other',
        explanation: 'Off topic',
      })
    );
  });

  it('drops a typed explanation when the reason is switched away from Other', async () => {
    const { onSubmit, send } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'Other' }));
    await userEvent.type(screen.getByLabelText('Explanation'), 'Off topic');
    await userEvent.click(screen.getByRole('radio', { name: 'Spam' }));
    await userEvent.click(send);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ reason: 'spam' })
    );
  });

  it('shows the error and blocks a second send while pending', () => {
    setup({
      error: 'This comment already has an open report.',
      pending: true,
    });
    expect(
      screen.getByText('This comment already has an open report.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send report/ })).toBeDisabled();
  });
});
