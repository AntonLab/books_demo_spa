import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Popconfirm,
  Skeleton,
  theme,
  Typography,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { ChapterForm } from '@/components/organisms/ChapterForm';
import type { ChapterFormValues } from '@/components/organisms/ChapterForm';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import {
  useChapter,
  useDeleteChapter,
  useUpdateChapter,
} from '@/queries/chapters';
import { queryKeys } from '@/queries/keys';

export const EditChapterPage: FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const bookId = Number(params.bookId);
  const chapterId = Number(params.chapterId);

  const { data: session } = useSession();
  const book = useBook(bookId);
  const chapter = useChapter(chapterId);
  const update = useUpdateChapter(bookId, chapterId);
  const remove = useDeleteChapter(bookId, chapterId);

  if (chapter.isError || book.isError) {
    return <Alert type="error" title="Could not load this chapter." />;
  }
  if (chapter.isPending || book.isPending) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  const isCoAuthor = book.data.authors.some(
    (author) => author.id === session?.id
  );
  const isModerator =
    session?.role === 'admin' || session?.role === 'superadmin';
  if (!isCoAuthor && !isModerator) {
    return (
      <Alert
        type="warning"
        title="Only its co-authors can edit this chapter."
      />
    );
  }

  // A 409 is its own state, not an error in the form: the typed text is kept,
  // and the answer is to reload the chapter rather than to retry the save.
  const conflict =
    update.error instanceof ApiError && update.error.status === 409;

  const handleSubmit = (values: ChapterFormValues) => {
    update.mutate({ ...values, expectedUpdatedAt: chapter.data.updatedAt });
  };

  const reload = async () => {
    update.reset();
    await queryClient.invalidateQueries({
      queryKey: queryKeys.chapter(chapterId),
    });
  };

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(`/books/${bookId}/edit`),
    });
  };

  return (
    <>
      <Typography.Title level={2}>Edit chapter</Typography.Title>
      <Link to={`/books/${bookId}/edit`}>{`Back to ${book.data.title}`}</Link>

      <div style={{ marginTop: token.margin }}>
        {conflict && (
          <Alert
            type="warning"
            title="This chapter was changed by a co-author — reload"
            action={
              <Button size="small" onClick={() => void reload()}>
                Reload
              </Button>
            }
            style={{ marginBottom: token.margin }}
          />
        )}
        {update.isSuccess && (
          <Alert
            type="success"
            title="Saved."
            style={{ marginBottom: token.margin }}
          />
        )}
        <ChapterForm
          // Keyed by the version on screen: a reload or a save swaps in what
          // the server stored, while a refused save keeps the typed text.
          key={chapter.data.updatedAt}
          initialValues={{
            title: chapter.data.title,
            text: chapter.data.text,
          }}
          publishedAt={chapter.data.publishedAt}
          isSubmitting={update.isPending}
          error={conflict ? null : (update.error?.message ?? null)}
          onSubmit={handleSubmit}
        />
      </div>

      <Divider />

      {remove.error && (
        <Alert
          type="error"
          title={remove.error.message}
          style={{ marginBottom: token.margin }}
        />
      )}
      <Popconfirm
        title="Delete this chapter?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onConfirm={handleDelete}
      >
        <Button danger loading={remove.isPending}>
          Delete chapter
        </Button>
      </Popconfirm>
    </>
  );
};
