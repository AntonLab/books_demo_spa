import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Alert, Skeleton, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { ChapterForm } from '@/components/organisms/ChapterForm/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm/ChapterForm';
import { UnsavedTextNotice } from '@/components/molecules/UnsavedTextNotice/UnsavedTextNotice';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useCreateChapter } from '@/queries/chapters';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  isBlank,
  ownEntries,
  unsavedText,
  unsavedTextKeys,
} from '@/store/unsavedTextSlice';
import { isCreditedTo } from '@/types/user';
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
    (state) => ownEntries(state, session?.id)[unsavedKey]
  );
  // A create can land after the Account has already moved to an unrelated
  // route; without this, the delayed navigate() below would still fire and
  // pull them back here.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set here too, not only at init: StrictMode runs the cleanup once between
    // two mounts, which would otherwise leave the page never navigating.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (isError) {
    return <Alert type="error" title="Could not load this book." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  // Only a Co-author adds chapters: a Moderator may edit and delete them, but
  // the matrix gives no role but author a create on chapters.
  if (!isCreditedTo(book, session?.id)) {
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
          // Only while still here: the Account may have already moved to
          // an unrelated route, and forcing them back here now would be
          // jarring.
          if (mountedRef.current) void navigate(`/books/${bookId}/edit`);
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
