import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export const openWorkMenu = async (title: string) => {
  await userEvent.click(
    await screen.findByRole('button', { name: `More actions for ${title}` })
  );
};

export const clickWorkMenuItem = async (title: string, name: string) => {
  await openWorkMenu(title);
  await userEvent.click(await screen.findByRole('menuitem', { name }));
};
