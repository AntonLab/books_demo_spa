import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Alert, Skeleton } from 'antd';
import { ChapterForm } from '@/components/organisms/ChapterForm/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm/ChapterForm';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useCreateChapter } from '@/queries/chapters';
import { unsavedTextKeys } from '@/store/unsavedTextSlice';
import { useUnsavedText } from '@/store/useUnsavedText';
import { bookCapabilities } from '@/types/capabilities';

interface NewChapterBodyProps {
  bookId: number;
  onClose: () => void;
}

export const NewChapterBody: FC<NewChapterBodyProps> = ({
  bookId,
  onClose,
}) => {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const create = useCreateChapter(bookId);
  const unsaved = useUnsavedText(unsavedTextKeys.chapterNew(bookId));
  const { entry } = unsaved;
  // A create can land after the modal is gone; without this, the delayed
  // onClose() would still fire.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set here too, not only at init: StrictMode runs the cleanup once between
    // two mounts, which would otherwise leave the modal never closing.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (isError) {
    return <Alert type="error" title="Could not load this book." />;
  }
  if (isPending || sessionPending)
    return <Skeleton active paragraph={{ rows: 6 }} />;

  // Only a Co-author adds chapters: a Moderator may edit and delete them, but
  // the matrix gives no role but author a create on chapters.
  if (!session || !bookCapabilities(book, session).isCoAuthor) {
    return (
      <Alert
        type="warning"
        title="Only its co-authors can add chapters to this book."
      />
    );
  }

  const handleSubmit = ({ title, text, publishedAt }: ChapterFormValues) => {
    // mutateAsync, not mutate's per-call onSuccess, which TanStack skips if
    // the component unmounts first: the promise still settles.
    void create
      .mutateAsync({ bookId, title, text, publishedAt: publishedAt ?? null })
      .then(
        () => {
          unsaved.discard();
          if (mountedRef.current) onClose();
        },
        // The rejection already shows through create.error.
        () => {}
      );
  };

  return (
    <ChapterForm
      isSubmitting={create.isPending}
      error={create.error?.message ?? null}
      onSubmit={handleSubmit}
      initialValues={
        entry ? { title: entry.title ?? '', text: entry.text } : undefined
      }
      onValuesChange={unsaved.write}
    />
  );
};
