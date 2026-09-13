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
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager';
import { SeriesForm } from '@/components/organisms/SeriesForm';
import { SortableList } from '@/components/organisms/SortableList';
import { ApiError } from '@/api/client';
import { useSession } from '@/queries/auth';
import {
  useDeleteSeries,
  useRemoveBookFromSeries,
  useReorderSeriesBooks,
  useSeries,
  useSeriesBooks,
  useUpdateSeries,
} from '@/queries/series';
import { BOOK_STATUS_LABELS } from '@/types/book';
import type { SeriesBookSummary } from '@/types/series';

export const EditSeriesPage: FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const seriesId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: series, isPending, isError } = useSeries(seriesId);
  const isCoAuthor =
    series?.authors.some((author) => author.id === session?.id) ?? false;
  // A Moderator may edit and delete any series, and order its books, but never
  // change its byline — CoAuthorManager stays read-only for one.
  const isModerator =
    session?.role === 'admin' || session?.role === 'superadmin';
  const mayEdit = Boolean(session) && (isCoAuthor || isModerator);

  const update = useUpdateSeries(seriesId);
  const remove = useDeleteSeries(seriesId);
  const books = useSeriesBooks(seriesId, mayEdit);
  const reorder = useReorderSeriesBooks(seriesId);
  const takeOut = useRemoveBookFromSeries(seriesId);

  if (isError) {
    return <Alert type="error" title="Could not load this series." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // Mirrors the server, which refuses anyone else with a 403.
  if (!session || !mayEdit) {
    return (
      <Alert type="warning" title="Only its co-authors can edit this series." />
    );
  }

  const reorderConflict =
    reorder.error instanceof ApiError && reorder.error.status === 409;

  // A Draft book filed here is listed to every Co-author of the series, so they
  // can order it, but opens only for its own Co-authors and Moderators: for
  // anyone else it is named rather than linked.
  const bookRow = (book: SeriesBookSummary) => {
    const readable =
      book.status !== 'draft' ||
      isModerator ||
      book.authors.some((author) => author.id === session.id);

    return (
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          {readable ? (
            <Link to={`/books/${book.id}`}>{book.title}</Link>
          ) : (
            <Typography.Text>{book.title}</Typography.Text>
          )}
          <Tag>{BOOK_STATUS_LABELS[book.status]}</Tag>
          <Typography.Text type="secondary">
            {book.authors
              .map((author) => `${author.firstName} ${author.lastName}`)
              .join(', ')}
          </Typography.Text>
        </Space>
        <Popconfirm
          title="Take this book out of the series?"
          description="The book stays. Filing it again puts it at the end."
          okText="Take it out"
          onConfirm={() => takeOut.mutate(book.id)}
        >
          <Button
            size="small"
            loading={takeOut.isPending && takeOut.variables === book.id}
          >
            Remove from series
          </Button>
        </Popconfirm>
      </Space>
    );
  };

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(isCoAuthor ? '/my-books' : '/'),
    });
  };

  return (
    <>
      <Typography.Title level={2}>Edit series</Typography.Title>

      {update.isSuccess && (
        <Alert
          type="success"
          title="Saved."
          style={{ marginBottom: token.margin }}
        />
      )}
      <SeriesForm
        // Keyed by the last save, so the fields reset to what the server
        // stored rather than keeping a stale copy of the loaded series.
        key={series.updatedAt}
        submitLabel="Save"
        initialValues={{
          title: series.title,
          description: series.description,
          tags: series.tags,
        }}
        isSubmitting={update.isPending}
        error={update.error?.message ?? null}
        onSubmit={(values) => update.mutate(values)}
      />

      <Divider />

      <Typography.Title level={4}>Books</Typography.Title>
      {/* A 409 has already brought in the current list; this says why the
          order just moved under the author's hands. */}
      {reorder.error && (
        <Alert
          type={reorderConflict ? 'warning' : 'error'}
          title={
            reorderConflict
              ? 'A co-author changed the books of this series while you were reordering them. This is their current order.'
              : 'Could not save the new book order.'
          }
          style={{ marginBottom: token.margin }}
        />
      )}
      {takeOut.error && (
        <Alert
          type="error"
          title={takeOut.error.message}
          style={{ marginBottom: token.margin }}
        />
      )}
      <SortableList
        items={(books.data?.items ?? []).map((book) => ({
          id: book.id,
          label: book.title,
          content: bookRow(book),
        }))}
        isPending={books.isPending}
        isError={books.isError}
        errorText="Could not load the books of this series."
        emptyText="No books in this series yet. File one into it from the book's edit page."
        onReorder={(bookIds) => reorder.mutate(bookIds)}
      />

      <Divider />

      <CoAuthorManager
        work={{ kind: 'series', id: series.id }}
        authors={series.authors}
        viewerId={session.id}
        canManage={isCoAuthor}
        onLeave={() => void navigate('/my-books')}
      />

      <Divider />

      <Space direction="vertical">
        {remove.error && <Alert type="error" title={remove.error.message} />}
        <Popconfirm
          title="Delete this series?"
          description="Its books stay, outside any series."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={handleDelete}
        >
          <Button danger loading={remove.isPending}>
            Delete series
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
};
