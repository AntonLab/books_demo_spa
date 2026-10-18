import { act, waitFor } from '@testing-library/react';

interface FocusRestoreSteps {
  open: () => Promise<unknown>;
  close: () => Promise<unknown>;
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
