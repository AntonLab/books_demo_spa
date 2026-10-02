import type { FC, Ref } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';

export interface IconButtonProps extends Omit<
  ButtonProps,
  'aria-label' | 'title'
> {
  label: string;
  // A drag handle needs the node.
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>;
}

export const IconButton: FC<IconButtonProps> = ({ label, ...rest }) => (
  <Tooltip title={label} trigger={['hover', 'focus']}>
    <Button aria-label={label} {...rest} />
  </Tooltip>
);
