import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { BookCoverManager } from '@/components/organisms/BookCoverManager';
import { BookForm } from '@/components/organisms/BookForm';
import type { BookFormValues } from '@/components/organisms/BookForm';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager';
import { ReadingOrderList } from '@/components/organisms/ReadingOrderList';
import { useSession } from '@/queries/auth';
import { useBook, useDeleteBook, useUpdateBook } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useMySeries } from '@/queries/series';
import styles from './EditBookPage.module.css';

export const EditBookPage: FC = () => {
  const navigate = useNavigate();
  const bookId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const series = useMySeries(
    session?.role === 'author' ? session.id : undefined
  );
  const genres = useGenres();
  const update = useUpdateBook(bookId);
  const remove = useDeleteBook(bookId);

  if (isError) {
    return <Alert type="error" title="Could not load this book." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  const isCoAuthor = book.authors.some((author) => author.id === session?.id);
  // A Moderator may edit and delete any book, but never change its byline —
  // CoAuthorManager stays read-only for one.
  const isModerator =
    session?.role === 'admin' || session?.role === 'superadmin';

  // Mirrors the server, which refuses anyone else with a 403: offering the
  // form would only collect edits it cannot save.
  if (!session || (!isCoAuthor && !isModerator)) {
    return (
      <Alert type="warning" title="Only its co-authors can edit this book." />
    );
  }

  // The book's current series is always an option, even one the viewer does
  // not co-author — a Moderator's, or a series whose credits changed — so the
  // select shows its name rather than a bare id.
  const own = (series.data?.items ?? []).map(({ id, title }) => ({
    id,
    title,
  }));
  const seriesOptions =
    book.series && !own.some((entry) => entry.id === book.series?.id)
      ? [...own, book.series]
      : own;

  const handleSubmit = (values: BookFormValues) => {
    update.mutate(values);
  };

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(isCoAuthor ? '/my-books' : '/'),
    });
  };

  return (
    <>
      <Typography.Title level={2}>Edit book</Typography.Title>
      <Link to={`/books/${book.id}`}>View the book page</Link>

      <div className={styles.body}>
        {update.isSuccess && (
          <Alert type="success" title="Saved." className={styles.alert} />
        )}
        <BookForm
          // Keyed by the last save, so the fields reset to what the server
          // stored rather than keeping a stale copy of the loaded book.
          key={book.updatedAt}
          seriesOptions={seriesOptions}
          genreOptions={genres.data?.items ?? []}
          submitLabel="Save"
          showStatus
          initialValues={{
            title: book.title,
            description: book.description,
            tags: book.tags,
            seriesId: book.seriesId,
            genreId: book.genre?.id ?? null,
            status: book.status,
          }}
          isSubmitting={update.isPending}
          error={update.error?.message ?? null}
          onSubmit={handleSubmit}
        />
      </div>

      <Divider />

      <BookCoverManager
        bookId={bookId}
        coverUrl={book.coverUrl}
        title={book.title}
      />

      <Divider />

      <ReadingOrderList bookId={bookId} isCoAuthor={isCoAuthor} />

      <Divider />

      <CoAuthorManager
        work={{ kind: 'book', id: book.id }}
        authors={book.authors}
        viewerId={session.id}
        canManage={isCoAuthor}
        onLeave={() => void navigate('/my-books')}
      />

      <Divider />

      <Space direction="vertical">
        {remove.error && <Alert type="error" title={remove.error.message} />}
        <Popconfirm
          title="Delete this book?"
          description="Its chapters and comments are deleted with it."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={handleDelete}
        >
          <Button danger loading={remove.isPending}>
            Delete book
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
};
