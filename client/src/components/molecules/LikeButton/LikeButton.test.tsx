import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('shows the count', () => {
    render(<LikeButton count={4} likedId={null} onToggle={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveTextContent('4');
  });

  it('reads as not pressed when the viewer has not liked', () => {
    render(<LikeButton count={0} likedId={null} onToggle={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads as pressed when the viewer has liked', () => {
    render(<LikeButton count={1} likedId={12} onToggle={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports null when liking', async () => {
    const onToggle = jest.fn();
    render(<LikeButton count={0} likedId={null} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(null);
  });

  it('reports the existing id when unliking', async () => {
    const onToggle = jest.fn();
    render(<LikeButton count={1} likedId={12} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button'));

    // The caller needs the row id to delete, and it already has it from
    // viewerLikeId — handing it back saves a lookup.
    expect(onToggle).toHaveBeenCalledWith(12);
  });

  it('does not fire while disabled', async () => {
    const onToggle = jest.fn();
    render(
      <LikeButton count={1} likedId={null} disabled onToggle={onToggle} />
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
