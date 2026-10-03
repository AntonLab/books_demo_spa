import { useState } from 'react';
import type { FC } from 'react';
import { UnorderedListOutlined } from '@ant-design/icons';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { AddToReadingListModal } from './AddToReadingListModal';
import type { WorkTarget } from '@/api/readingLists';

// The caller mounts it only when the viewer may add the work.
export const AddToReadingList: FC<{ target: WorkTarget }> = ({ target }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        type="text"
        size="small"
        label="Add to reading list"
        icon={<UnorderedListOutlined aria-hidden />}
        onClick={() => setOpen(true)}
      />
      {open && (
        <AddToReadingListModal target={target} onClose={() => setOpen(false)} />
      )}
    </>
  );
};
