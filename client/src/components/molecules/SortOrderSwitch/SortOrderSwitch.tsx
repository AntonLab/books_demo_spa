import { useId, type FC } from 'react';
import { Flex, Grid, Segmented, Typography } from 'antd';
import { BOOK_SORTS, type BookSort } from 'shared';
import { BOOK_SORT_LABELS } from '@/types/book';
import styles from './SortOrderSwitch.module.css';

interface SortOrderSwitchProps {
  value: BookSort;
  onChange: (sort: BookSort) => void;
}

const OPTIONS = BOOK_SORTS.map((sort) => ({
  value: sort,
  label: BOOK_SORT_LABELS[sort],
}));

// Controlled only: the caller may refuse a pick (the search page does, when
// its form fails its rules), and the old option must then stay checked.
export const SortOrderSwitch: FC<SortOrderSwitchProps> = ({
  value,
  onChange,
}) => {
  const labelId = useId();
  // `xs` alone, not `!sm`: before antd has measured, every breakpoint is
  // unset, and a desktop would flash the phone layout.
  const phone = Grid.useBreakpoint().xs === true;

  return (
    <Flex
      vertical={phone}
      align={phone ? 'stretch' : 'center'}
      gap="small"
      className={phone ? styles.phone : undefined}
    >
      <Typography.Text id={labelId}>Sort by</Typography.Text>
      <Segmented<BookSort>
        aria-labelledby={labelId}
        block={phone}
        value={value}
        onChange={onChange}
        options={OPTIONS}
      />
    </Flex>
  );
};
