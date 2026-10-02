import { useState } from 'react';
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

// Focus is tracked here rather than through the Tooltip's 'focus' trigger: that
// trigger closes on blur through flushSync, and a button that loses focus to a
// dialog or popover blurs during React's commit, where flushSync logs an error.
export const IconButton: FC<IconButtonProps> = ({
  label,
  tooltipHidden,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Tooltip
      title={label}
      trigger={['hover']}
      open={!tooltipHidden && (hovered || focused)}
      onOpenChange={setHovered}
    >
      <Button
        aria-label={label}
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
    </Tooltip>
  );
};
