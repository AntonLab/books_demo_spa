import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryButtons } from './LibraryButtons';

const renderButtons = (
  props: Partial<React.ComponentProps<typeof LibraryButtons>> = {}
) => {
  const handlers = {
    onAdd: jest.fn(),
    onRemove: jest.fn(),
    onToggleNotInterested: jest.fn(),
  };
  render(
    <LibraryButtons
      inLibrary={false}
      notInterested={false}
      addLabel="Add to Library"
      removeLabel="Remove from Library"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('LibraryButtons', () => {
  it('offers Add, and no Remove, outside the Library', async () => {
    const { onAdd } = renderButtons();

    expect(screen.queryByRole('button', { name: 'Remove from Library' })).toBe(
      null
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Add to Library' })
    );

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('offers Remove, and no Add, inside the Library', async () => {
    const { onRemove } = renderButtons({ inLibrary: true });

    expect(screen.queryByRole('button', { name: 'Add to Library' })).toBe(null);
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove from Library' })
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('presses Not interested when the work is marked so', async () => {
    const { onToggleNotInterested } = renderButtons({ notInterested: true });

    const button = screen.getByRole('button', { name: 'Not interested' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);

    expect(onToggleNotInterested).toHaveBeenCalledTimes(1);
  });

  it('disables every button while a request is pending', () => {
    renderButtons({ disabled: true });

    expect(
      screen.getByRole('button', { name: 'Add to Library' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Not interested' })
    ).toBeDisabled();
  });

  it('disables Not interested and says why when the Book is kept as a reader', () => {
    renderButtons({ inLibrary: true, keptAsReader: true });

    expect(
      screen.getByRole('button', { name: 'Not interested' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove from Library' })
    ).toBeEnabled();
    expect(screen.getByText('Remove it from your Library first')).toBeVisible();
  });

  it('shows no hint otherwise', () => {
    renderButtons();

    expect(screen.queryByText('Remove it from your Library first')).toBe(null);
  });
});
