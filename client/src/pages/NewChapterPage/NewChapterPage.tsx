import type { FC } from 'react';
import { Alert, Skeleton, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { ChapterForm } from '@/components/organisms/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useCreateChapter } from '@/queries/chapters';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  isBlank,
  unsavedText,
  unsavedTextKeys,
} from '@/store/unsavedTextSlice';
import styles from './NewChapterPage.module.css';

export const NewChapterPage: FC = () => {
  const navigate = useNavigate();
  const bookId = Number(useParams().bookId);
  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const create = useCreateChapter(bookId);
  const dispatch = useAppDispatch();
  const unsavedKey = unsavedTextKeys.chapterNew(bookId);
  const entry = useAppSelector(
    (state) => state.unsavedText.entries[unsavedKey]
  );

  if (isError) {
    return <Alert type="error" title="Could not load this book." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  // Only a Co-author adds chapters: a Moderator may edit and delete them, but
  // the matrix gives no role but author a create on chapters.
  if (!book.authors.some((author) => author.id === session?.id)) {
    return (
      <>
        <Alert
          type="warning"
          title="Only its co-authors can add chapters to this book."
        />
        {session && entry && !isBlank(entry) && (
          <UnsavedTextNotice
            title={entry.title}
            text={entry.text}
            onDiscard={() => dispatch(unsavedText.remove(unsavedKey))}
          />
        )}
      </>
    );
  }

  const handleSubmit = ({ title, text, publishedAt }: ChapterFormValues) => {
    // mutateAsync over mutate's per-call onSuccess: TanStack skips that
    // callback if the page unmounts before the mutation settles, but
    // mutateAsync's own promise still settles, so the entry is still
    // cleared instead of re-seeding the next "New chapter" form.
    void create
      .mutateAsync({ bookId, title, text, publishedAt: publishedAt ?? null })
      .then(
        () => {
          dispatch(unsavedText.remove(unsavedKey));
          void navigate(`/books/${bookId}/edit`);
        },
        // A rejection is already surfaced through create.error; this handler
        // exists only so the rejection is not left unhandled.
        () => {}
      );
  };

  return (
    <>
      <Typography.Title level={2}>New chapter</Typography.Title>
      <Link to={`/books/${bookId}/edit`}>{`Back to ${book.title}`}</Link>
      <div className={styles.body}>
        <ChapterForm
          isSubmitting={create.isPending}
          error={create.error?.message ?? null}
          onSubmit={handleSubmit}
          initialValues={
            entry ? { title: entry.title ?? '', text: entry.text } : undefined
          }
          onValuesChange={(values) =>
            dispatch(unsavedText.upsert({ key: unsavedKey, ...values }))
          }
        />
      </div>
    </>
  );
};
