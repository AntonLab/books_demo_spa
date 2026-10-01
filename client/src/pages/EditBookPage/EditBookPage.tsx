import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Flex,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { BookCoverManager } from '@/components/organisms/BookCoverManager/BookCoverManager';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { BookUnsavedTextNotices } from '@/components/organisms/BookUnsavedTextNotices/BookUnsavedTextNotices';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager/CoAuthorManager';
import { ReadingOrderList } from '@/components/organisms/ReadingOrderList/ReadingOrderList';
import { useSession } from '@/queries/auth';
import { bookCapabilities } from '@/types/capabilities';
import { useBook, useDeleteBook } from '@/queries/books';
import spacing from '@/theme/spacing.module.css';

export const EditBookPage: FC = () => {
  const navigate = useNavigate();
  const bookId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: book, isPending, isError, error } = useBook(bookId);
  const [editing, setEditing] = useState(false);
  const remove = useDeleteBook(bookId);

  if (isError) {
    return (
      <>
        <Alert
          type="error"
          title="Could not load this book."
          className={spacing.gapBelow}
        />
        {error instanceof ApiError && error.status === 404 && (
          <BookUnsavedTextNotices bookId={bookId} />
        )}
      </>
    );
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // A Moderator may edit and delete any book, but never change its byline —
  // CoAuthorManager stays read-only for one.
  const { isCoAuthor, mayEdit } = bookCapabilities(book, session);

  // The server refuses anyone else with a 403: offering the form would only
  // collect edits it cannot save.
  if (!session || !mayEdit) {
    return (
      <Alert type="warning" title="Only its co-authors can edit this book." />
    );
  }

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(isCoAuthor ? '/profile/my-books' : '/'),
    });
  };

  return (
    <>
      <Flex justify="space-between" align="center">
        <Typography.Title level={2}>Manage book: {book.title}</Typography.Title>
        <Button onClick={() => setEditing(true)}>Edit details</Button>
      </Flex>
      <Link to={`/books/${book.id}`}>View the book page</Link>
      {editing && (
        <BookEditDetailsModal
          bookId={bookId}
          onClose={() => setEditing(false)}
        />
      )}

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
        onLeave={() => void navigate('/profile/my-books')}
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
