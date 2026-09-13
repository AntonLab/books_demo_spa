import type { FC } from 'react';
import { Alert, Divider, Skeleton, Space, Tag, theme, Typography } from 'antd';
import { Link, useParams } from 'react-router';
import { LikeButton } from '@/components/molecules/LikeButton';
import { ChapterList } from '@/components/organisms/ChapterList';
import { CommentSection } from '@/components/organisms/CommentSection';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapters } from '@/queries/chapters';
import { queryKeys } from '@/queries/keys';
import { useToggleLike } from '@/queries/likes';
import { BOOK_STATUS_LABELS } from '@/types/book';

export const BookPage: FC = () => {
  const { token } = theme.useToken();
  const { id } = useParams();
  const bookId = Number(id);

  const { data: session } = useSession();
  const { data: book, isPending, isError } = useBook(bookId);
  // Fetched in parallel with the book rather than after it: neither section
  // needs the detail response to know what to ask for.
  const chapters = useChapters(bookId);
  const toggleLike = useToggleLike(queryKeys.book(bookId));

  if (isError) {
    return <Alert type="error" message="Could not load this book." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  // Mirrors the server: nobody likes or comments on a Draft book, and nobody
  // likes a book they co-author. The server answers 403 either way — this only
  // avoids offering what would fail.
  const isDraft = book.status === 'draft';
  const canLike =
    !isDraft &&
    session !== null &&
    session !== undefined &&
    !book.authors.some((author) => author.id === session.id);

  return (
    <article>
      <Typography.Title level={2}>{book.title}</Typography.Title>

      <Space size={token.marginSM} wrap>
        <Typography.Text>
          {book.authors
            .map((author) => `${author.firstName} ${author.lastName}`)
            .join(', ')}
        </Typography.Text>
        <Tag color={isDraft ? 'orange' : undefined}>
          {BOOK_STATUS_LABELS[book.status]}
        </Tag>
        {book.series && (
          <Link to={`/series?id=${book.series.id}`}>{book.series.title}</Link>
        )}
        {canLike && (
          <LikeButton
            count={book.likeCount}
            likedId={book.viewerLikeId}
            onToggle={(existingId) =>
              toggleLike.mutate({
                existingId,
                payload: { bookId: book.id, isLike: true },
              })
            }
          />
        )}
      </Space>

      {book.tags.length > 0 && (
        <div style={{ marginTop: token.marginXS }}>
          {book.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      <Typography.Paragraph style={{ marginTop: token.marginSM }}>
        {book.description}
      </Typography.Paragraph>

      <Divider />

      <Typography.Title level={3}>Chapters</Typography.Title>
      <ChapterList
        bookId={bookId}
        items={chapters.data?.items ?? []}
        isPending={chapters.isPending}
        isError={chapters.isError}
      />

      <Divider />

      <CommentSection bookId={bookId} closed={isDraft} />
    </article>
  );
};
