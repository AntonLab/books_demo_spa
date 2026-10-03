import type { FC } from 'react';
import { Select } from 'antd';
import { READING_STATUSES } from 'shared';
import type { ReadingStatus } from 'shared';
import { READING_STATUS_LABELS } from '@/types/library';

// No status uses this string, so it can stand for "remove" in the option list.
const REMOVE = 'remove';

const STATUS_OPTIONS = READING_STATUSES.map((status) => ({
  value: status,
  label: READING_STATUS_LABELS[status],
}));
const OPTIONS_WITH_REMOVE = [
  ...STATUS_OPTIONS,
  { value: REMOVE, label: 'Remove from library' },
];

type Props = {
  value: ReadingStatus | null;
  onChange: (status: ReadingStatus | null) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

// Removal is an option, not allowClear: a keyboard user finds it in the list.
export const ReadingStatusSelect: FC<Props> = ({
  value,
  onChange,
  disabled,
  className,
  id,
}) => (
  <Select
    id={id}
    aria-label="Reading status"
    placeholder="Add to library"
    className={className}
    disabled={disabled}
    popupMatchSelectWidth={false}
    value={value ?? undefined}
    options={value === null ? STATUS_OPTIONS : OPTIONS_WITH_REMOVE}
    onChange={(next: string) =>
      onChange(READING_STATUSES.find((status) => status === next) ?? null)
    }
  />
);
