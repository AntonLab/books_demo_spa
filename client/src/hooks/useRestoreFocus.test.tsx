import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import type { FC } from 'react';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useRestoreFocus } from './useRestoreFocus';

const focusedButton = () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  act(() => opener.focus());
  return opener;
};

describe('useRestoreFocus', () => {
  afterEach(() => document.body.replaceChildren());

  it('focuses the opener on unmount', () => {
    const opener = focusedButton();
    const focus = jest.spyOn(opener, 'focus');
    const { unmount } = renderHook(() => useRestoreFocus());

    unmount();

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('does not focus an opener that left the DOM', () => {
    const opener = focusedButton();
    const focus = jest.spyOn(opener, 'focus');
    const { unmount } = renderHook(() => useRestoreFocus());
    opener.remove();

    unmount();

    expect(focus).not.toHaveBeenCalled();
  });

  it('does not focus an opener that became disabled', () => {
    const opener = focusedButton();
    const focus = jest.spyOn(opener, 'focus');
    const { unmount } = renderHook(() => useRestoreFocus());
    opener.disabled = true;

    unmount();

    expect(focus).not.toHaveBeenCalled();
  });

  it('keeps focus inside the dialog after open under StrictMode', async () => {
    // A real dialog: only its autofocus can lose to a re-run opener focus.
    const Page: FC = () => (
      <DiscardGuardModal title="Dialog" onClose={jest.fn()}>
        <input aria-label="Name" />
      </DiscardGuardModal>
    );
    const opener = focusedButton();

    renderWithProviders(
      <StrictMode>
        <Page />
      </StrictMode>
    );

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(opener).not.toHaveFocus());
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
