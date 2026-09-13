import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { BookForm } from '@/components/organisms/BookForm';
import type { BookFormValues } from '@/components/organisms/BookForm';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager';
import { SortableList } from '@/components/organisms/SortableList';
import { ApiError } from '@/api/client';
import { useSession } from '@/queries/auth';
import { useBook, useDeleteBook, useUpdateBook } from '@/queries/books';
import { useChapters, useReorderChapters } from '@/queries/chapters';
import { useMySeries } from '@/queries/series';
import { chapterStateOf, type ChapterSummary } from '@/types/chapter';

// One row of the book's chapter list: a link to the chapter's editor, a badge
// for what is not out yet, and the date it came out or will.
const chapterRow = (bookId: number, chapter: ChapterSummary) => {
  const state = chapterStateOf(chapter);

  return (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space>
        <Link to={`/books/${bookId}/chapters/${chapter.id}/edit`}>
          {chapter.title}
        </Link>
        {state === 'draft' && <Tag>Draft</Tag>}
        {state === 'scheduled' && <Tag color="blue">Scheduled</Tag>}
      </Space>
      {chapter.publishedAt !== null && (
        <Typography.Text type="secondary">
          {new Date(chapter.publishedAt).toLocaleDateString()}
        </Typography.Text>
      )}
    </Space>
  );
};

export const EditBookPage: FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const bookId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  const series = useMySeries(
    session?.role === 'author' ? session.id : undefined
  );
  const update = useUpdateBook(bookId);
  const remove = useDeleteBook(bookId);
  const chapters = useChapters(bookId);
  const reorder = useReorderChapters(bookId);

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

  const reorderConflict =
    reorder.error instanceof ApiError && reorder.error.status === 409;

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

      <div style={{ marginTop: token.margin }}>
        {update.isSuccess && (
          <Alert
            type="success"
            title="Saved."
            style={{ marginBottom: token.margin }}
          />
        )}
        <BookForm
          // Keyed by the last save, so the fields reset to what the server
          // stored rather than keeping a stale copy of the loaded book.
          key={book.updatedAt}
          seriesOptions={seriesOptions}
          submitLabel="Save"
          showStatus
          initialValues={{
            title: book.title,
            description: book.description,
            tags: book.tags,
            seriesId: book.seriesId,
            status: book.status,
          }}
          isSubmitting={update.isPending}
          error={update.error?.message ?? null}
          onSubmit={handleSubmit}
        />
      </div>

      <Divider />

      <Space
        align="center"
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        <Typography.Title level={4}>Chapters</Typography.Title>
        {/* Only a Co-author: a Moderator may edit and delete chapters but has
            no create on them. */}
        {isCoAuthor && (
          <Link to={`/books/${book.id}/chapters/new`}>Add chapter</Link>
        )}
      </Space>
      {/* A 409 has already brought in the current list; this says why the
          order just moved under the author's hands. */}
      {reorder.error && (
        <Alert
          type={reorderConflict ? 'warning' : 'error'}
          title={
            reorderConflict
              ? 'A co-author changed the chapters while you were reordering them. This is their current order.'
              : 'Could not save the new chapter order.'
          }
          style={{ marginBottom: token.margin }}
        />
      )}
      {/* Every chapter, drafts and scheduled ones included: the server returns
          them all to a Co-author or a Moderator, and this is where they are
          worked on and put in Reading order. */}
      <SortableList
        items={(chapters.data?.items ?? []).map((chapter) => ({
          id: chapter.id,
          label: chapter.title,
          content: chapterRow(book.id, chapter),
        }))}
        isPending={chapters.isPending}
        isError={chapters.isError}
        errorText="Could not load the chapters."
        emptyText="No chapters yet."
        onReorder={(chapterIds) => reorder.mutate(chapterIds)}
      />

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
