import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortOrderSwitch } from './SortOrderSwitch';
import { renderWithProviders } from '@/test/renderWithProviders';

const renderSwitch = (value: 'popular' | 'new' | 'updated' = 'popular') => {
  const onChange = jest.fn();
  renderWithProviders(<SortOrderSwitch value={value} onChange={onChange} />);
  return { onChange };
};

describe('SortOrderSwitch', () => {
  it('offers every Sort order under a visible "Sort by", the current one checked', () => {
    renderSwitch('new');

    expect(screen.getByText('Sort by')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Sort by' });
    expect(group).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent)
    ).toEqual(['Popular', 'New releases', 'Recently updated']);
    expect(screen.getByRole('radio', { name: 'New releases' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Popular' })).not.toBeChecked();
  });

  it('reports a pick and leaves the checked option to its caller', async () => {
    const { onChange } = renderSwitch('popular');

    await userEvent.click(
      screen.getByRole('radio', { name: 'Recently updated' })
    );

    expect(onChange).toHaveBeenCalledWith('updated');
    // The caller did not change `value`, so the pick is not shown as made.
    expect(screen.getByRole('radio', { name: 'Popular' })).toBeChecked();
  });

  it('moves one option per arrow key', () => {
    const { onChange } = renderSwitch('popular');

    // Not `userEvent.keyboard`: it treats radios without a `name` as one
    // group and moves the check itself, a second change no browser makes.
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Popular' }), {
      key: 'ArrowRight',
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('new');
  });
});
