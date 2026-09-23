import type { FC } from 'react';
import { Alert, Skeleton, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { ChapterForm } from '@/components/organisms/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useCreateChapter } from '@/queries/chapters';
import styles from './NewChapterPage.module.css';

export const NewChapterPage: FC = () => {
  const navigate = useNavigate();
  const bookId = Number(useParams().bookId);
  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const create = useCreateChapter(bookId);

  if (isError) {
    return <Alert type="error" title="Could not load this book." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  // Only a Co-author adds chapters: a Moderator may edit and delete them, but
  // the matrix gives no role but author a create on chapters.
  if (!book.authors.some((author) => author.id === session?.id)) {
    return (
      <Alert
        type="warning"
        title="Only its co-authors can add chapters to this book."
      />
    );
  }

  const handleSubmit = ({ title, text, publishedAt }: ChapterFormValues) => {
    create.mutate(
      { bookId, title, text, publishedAt: publishedAt ?? null },
      { onSuccess: () => void navigate(`/books/${bookId}/edit`) }
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
        />
      </div>
    </>
  );
};
