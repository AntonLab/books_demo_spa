import { act, waitFor } from '@testing-library/react';

interface FocusRestoreSteps {
  // Activates the opener, which is already focused.
  open: () => Promise<unknown>;
  // Finds the open dialog and closes it.
  close: () => Promise<unknown>;
  // Asserts the dialog is gone; retried until it holds.
  gone: () => void;
}

export const expectFocusReturnsToOpener = async (
  opener: HTMLElement,
  { open, close, gone }: FocusRestoreSteps
) => {
  act(() => opener.focus());
  await open();
  await close();
  await waitFor(gone);
  expect(opener).toHaveFocus();
};
