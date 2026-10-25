import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppStore } from '../store';

const expectSwitchPresent = () =>
  expect(
    screen.getByRole('group', { name: 'Results layout' })
  ).toBeInTheDocument();

// The caller has already mocked a never-settling list and rendered.
export const expectSwitchWhileLoading = async () => {
  expect(
    await screen.findByRole('status', { name: 'Loading books' })
  ).toBeInTheDocument();
  expectSwitchPresent();
};

// The caller has already mocked a list rejected with 'boom' and rendered.
export const expectSwitchOnError = async (store: AppStore) => {
  expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  expectSwitchPresent();

  await userEvent.click(screen.getByRole('button', { name: 'List' }));

  expect(store.getState().devicePreferences.resultsLayout).toBe('list');
};

// `link` is a tile's title link in a rendered grid.
export const switchGridToList = async (store: AppStore, link: HTMLElement) => {
  expect(link.closest('.ant-col')).toHaveClass('ant-col-xs-12');

  await userEvent.click(screen.getByRole('button', { name: 'List' }));

  expect(store.getState().devicePreferences.resultsLayout).toBe('list');
  expect(link.closest('.ant-col')).toHaveClass('ant-col-24');
};
