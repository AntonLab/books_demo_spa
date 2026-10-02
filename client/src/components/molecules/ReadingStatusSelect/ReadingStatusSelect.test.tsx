import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingStatusSelect } from './ReadingStatusSelect';

const open = () =>
  userEvent.click(screen.getByRole('combobox', { name: 'Reading status' }));

describe('ReadingStatusSelect', () => {
  it('shows the placeholder when the book is not in the Library', () => {
    render(<ReadingStatusSelect value={null} onChange={jest.fn()} />);
    expect(screen.getByText('Add to library')).toBeInTheDocument();
  });

  it('shows the current status label', () => {
    render(<ReadingStatusSelect value="plan_to_read" onChange={jest.fn()} />);
    expect(screen.getByText('Plan to read')).toBeInTheDocument();
  });

  it('offers the four statuses and no removal while nothing is set', async () => {
    render(<ReadingStatusSelect value={null} onChange={jest.fn()} />);
    await open();
    for (const label of ['Reading', 'Plan to read', 'Read', 'Not interested']) {
      expect(screen.getByTitle(label)).toBeInTheDocument();
    }
    expect(screen.queryByTitle('Remove from library')).toBeNull();
  });

  it('reports the wire value of the chosen status', async () => {
    const onChange = jest.fn();
    render(<ReadingStatusSelect value={null} onChange={onChange} />);
    await open();
    await userEvent.click(screen.getByTitle('Plan to read'));
    expect(onChange).toHaveBeenCalledWith('plan_to_read');
  });

  it('offers removal once a status is set, and reports null', async () => {
    const onChange = jest.fn();
    render(<ReadingStatusSelect value="read" onChange={onChange} />);
    await open();
    await userEvent.click(screen.getByTitle('Remove from library'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is disabled when asked', () => {
    render(<ReadingStatusSelect value="read" disabled onChange={jest.fn()} />);
    expect(
      screen.getByRole('combobox', { name: 'Reading status' })
    ).toBeDisabled();
  });
});
