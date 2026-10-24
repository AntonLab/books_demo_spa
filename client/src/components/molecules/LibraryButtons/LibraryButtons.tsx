import type { FC } from 'react';
import { Button, Typography } from 'antd';

interface LibraryButtonsProps {
  inLibrary: boolean;
  notInterested: boolean;
  // One request at a time: a second click before the refetch lands would act
  // on a stale state.
  disabled?: boolean;
  // The server answers 409 for Not interested from reading or read, so the
  // button is off and the hint says how to get out.
  keptAsReader?: boolean;
  addLabel: string;
  removeLabel: string;
  onAdd: () => void;
  onRemove: () => void;
  onToggleNotInterested: () => void;
}

// The Library buttons of a Book page and a Series page.
export const LibraryButtons: FC<LibraryButtonsProps> = ({
  inLibrary,
  notInterested,
  disabled = false,
  keptAsReader = false,
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
  onToggleNotInterested,
}) => (
  <>
    {inLibrary ? (
      <Button disabled={disabled} onClick={onRemove}>
        {removeLabel}
      </Button>
    ) : (
      <Button disabled={disabled} onClick={onAdd}>
        {addLabel}
      </Button>
    )}
    <Button
      aria-pressed={notInterested}
      disabled={disabled || keptAsReader}
      onClick={onToggleNotInterested}
    >
      Not interested
    </Button>
    {keptAsReader && (
      <Typography.Text type="secondary">
        Remove it from your Library first
      </Typography.Text>
    )}
  </>
);
