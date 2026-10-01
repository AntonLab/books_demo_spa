import { useState } from 'react';
import type { FC, KeyboardEvent } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import styles from './ClearableSelect.module.css';

// `value` and `onChange` are the pair a Form.Item injects.
type Props = Omit<
  SelectProps<number>,
  'value' | 'onChange' | 'allowClear' | 'showSearch'
> & {
  value?: number;
  onChange?: (value: number | undefined) => void;
};

// A single Select of ids that can be emptied. antd draws its clear icon only on
// hover and makes it unfocusable, so a keyboard user could never empty it:
// the icon stays visible while there is a value, and Delete or Backspace on the
// focused, closed select clears it. There is no search input, so no typed text
// can be mistaken for the key.
export const ClearableSelect: FC<Props> = ({
  value,
  onChange,
  onKeyDown,
  onOpenChange,
  ...rest
}) => {
  const [open, setOpen] = useState(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (
      !open &&
      value !== undefined &&
      (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      onChange?.(undefined);
    }
  };

  return (
    <Select
      {...rest}
      className={styles.select}
      allowClear
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    />
  );
};
