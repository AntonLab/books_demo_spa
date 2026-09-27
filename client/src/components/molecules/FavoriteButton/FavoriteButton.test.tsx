import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from './FavoriteButton';

describe('FavoriteButton', () => {
  it('offers to add, unpressed, with the count', () => {
    render(<FavoriteButton count={3} favoriteId={null} onToggle={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Add to favorites' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('3');
  });

  it('offers to remove, pressed, once the work is a Favorite', () => {
    render(<FavoriteButton count={4} favoriteId={12} onToggle={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Remove from favorites' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the star out of the accessible name', () => {
    render(<FavoriteButton count={0} favoriteId={null} onToggle={jest.fn()} />);

    // The icon renders role="img" named after itself unless hidden, which
    // would read "star" before the label.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reports null when adding', async () => {
    const onToggle = jest.fn();
    render(<FavoriteButton count={0} favoriteId={null} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(null);
  });

  it('reports the Favorite’s id when removing', async () => {
    const onToggle = jest.fn();
    render(<FavoriteButton count={1} favoriteId={12} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(12);
  });

  it('is disabled when asked', () => {
    // Asserted, not clicked: user-event refuses to click an element whose
    // computed pointer-events is none, which antd may give a disabled button.
    render(
      <FavoriteButton
        count={0}
        favoriteId={null}
        disabled
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
