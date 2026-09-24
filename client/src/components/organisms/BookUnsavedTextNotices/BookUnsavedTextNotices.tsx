import type { FC } from 'react';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice';
import { useSession } from '@/queries/auth';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { entriesOfBook, unsavedText } from '@/store/unsavedTextSlice';

interface BookUnsavedTextNoticesProps {
  bookId: number;
}

// Every Unsaved text typed anywhere in a Book whose page found it gone. Its
// own component so a page subscribes to the entries only in that branch,
// rather than re-rendering on every keystroke typed elsewhere.
export const BookUnsavedTextNotices: FC<BookUnsavedTextNoticesProps> = ({
  bookId,
}) => {
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const entries = useAppSelector((state) => state.unsavedText.entries);

  if (!session) return null;

  return (
    <>
      {entriesOfBook(entries, bookId).map(([key, entry]) => (
        <UnsavedTextNotice
          key={key}
          title={entry.title}
          text={entry.text}
          onDiscard={() => dispatch(unsavedText.remove(key))}
        />
      ))}
    </>
  );
};
