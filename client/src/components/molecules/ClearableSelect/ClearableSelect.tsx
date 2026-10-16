import type { FC } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useClearable } from '@/hooks/useClearable';

// `value` and `onChange` are the pair a Form.Item injects.
type Props = Omit<
  SelectProps<number>,
  'value' | 'onChange' | 'allowClear' | 'showSearch' | 'open'
> & {
  value?: number;
  onChange?: (value: number | undefined) => void;
};

// A single Select of ids that can be emptied; clears through `useClearable`.
export const ClearableSelect: FC<Props> = ({
  value,
  onChange,
  onKeyDown,
  onOpenChange,
  ...rest
}) => {
  const clearable = useClearable({ value, onChange, onKeyDown, onOpenChange });

  return <Select {...rest} {...clearable} value={value} onChange={onChange} />;
};
