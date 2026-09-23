import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedTextNotice } from './UnsavedTextNotice';

describe('UnsavedTextNotice', () => {
  it('shows the text read-only', () => {
    render(<UnsavedTextNotice text="Lost words" onDiscard={jest.fn()} />);

    const box = screen.getByRole('textbox', { name: 'Unsaved text' });
    expect(box).toHaveValue('Lost words');
    expect(box).toHaveAttribute('readonly');
  });

  it('puts a chapter title above its text', () => {
    render(
      <UnsavedTextNotice
        title="Chapter One"
        text="It was a dark night."
        onDiscard={jest.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Unsaved text' })).toHaveValue(
      'Chapter One\n\nIt was a dark night.'
    );
  });

  it('copies the text without discarding it', async () => {
    // setup() installs user-event's clipboard stub; jsdom has none.
    const user = userEvent.setup();
    const onDiscard = jest.fn();
    render(<UnsavedTextNotice text="Lost words" onDiscard={onDiscard} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await navigator.clipboard.readText()).toBe('Lost words');
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('discards on request', async () => {
    const onDiscard = jest.fn();
    render(<UnsavedTextNotice text="Lost words" onDiscard={onDiscard} />);

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
