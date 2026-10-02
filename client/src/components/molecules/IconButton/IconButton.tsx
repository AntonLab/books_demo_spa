import type { FC, Ref } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';

export interface IconButtonProps extends Omit<
  ButtonProps,
  'aria-label' | 'title'
> {
  label: string;
  // Keeps the tooltip shut while the button's Popover is open, so it does not
  // cover it.
  tooltipHidden?: boolean;
  // A drag handle needs the node.
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>;
}

export const IconButton: FC<IconButtonProps> = ({
  label,
  tooltipHidden,
  ...rest
}) => (
  <Tooltip
    title={label}
    trigger={['hover', 'focus']}
    open={tooltipHidden ? false : undefined}
  >
    <Button aria-label={label} {...rest} />
  </Tooltip>
);
