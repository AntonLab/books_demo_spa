import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditOutlined } from '@ant-design/icons';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('is named by its label', () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows its label as a tooltip on hover', async () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} />);
    await userEvent.hover(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit');
  });

  it('shows its label as a tooltip on keyboard focus', async () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} />);
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit');
  });

  it('closes the keyboard-focus tooltip when focus leaves', async () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} />);
    await userEvent.tab();
    await screen.findByRole('tooltip');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    );
  });

  it('shows the tooltip while disabled', async () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} disabled />);
    await userEvent.hover(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit');
  });

  it('shows a tooltip text that differs from the name', async () => {
    render(
      <IconButton label="Edit" tooltip="Not yours" icon={<EditOutlined />} />
    );
    const button = screen.getByRole('button', { name: 'Edit' });
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Not yours');
  });

  it('keeps the tooltip closed on hover and focus while tooltipHidden, and the name', async () => {
    render(<IconButton label="Edit" icon={<EditOutlined />} tooltipHidden />);
    const button = screen.getByRole('button', { name: 'Edit' });
    await userEvent.hover(button);
    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(button).toHaveAccessibleName('Edit');
  });

  it('renders children after the icon without changing its name', () => {
    render(
      <IconButton label="Like" icon={<EditOutlined />}>
        3
      </IconButton>
    );
    const button = screen.getByRole('button', { name: 'Like' });
    expect(button).toHaveTextContent('3');
  });

  it('passes clicks through', async () => {
    const onClick = jest.fn();
    render(
      <IconButton label="Edit" icon={<EditOutlined />} onClick={onClick} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
