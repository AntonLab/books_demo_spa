import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// antd draws the clear icon inside the select that wraps the labelled input.
export const clearSelect = async (label: string) => {
  const select = screen.getByLabelText(label).closest('.ant-select');
  await userEvent.click(select!.querySelector('.ant-select-clear')!);
};
