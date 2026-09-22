import type { FC } from 'react';
import {
  Alert,
  Divider,
  Flex,
  Skeleton,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd';
import { Link, useParams } from 'react-router';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { BookCover } from '@/components/molecules/BookCover';
import { LikeButton } from '@/components/molecules/LikeButton';
import { ChapterList } from '@/components/organisms/ChapterList';
import { CommentSection } from '@/components/organisms/CommentSection';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapters } from '@/queries/chapters';
import { queryKeys } from '@/queries/keys';
import { useToggleLike } from '@/queries/likes';
import { BOOK_STATUS_LABELS } from '@/types/book';
import { publishedChapters } from '@/types/chapter';

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
  const isCoAuthor =
    session !== null &&
    session !== undefined &&
    book.authors.some((author) => author.id === session.id);
  const canLike =
    !isDraft && session !== null && session !== undefined && !isCoAuthor;

  return (
    <article>
      {/* Flex, not Space: Space wraps each child in a div.ant-space-item
          that carries no flex rule of its own, so a flex style on a child
          beneath it does nothing. Flex's children are the flex items
          themselves. */}
      <Flex align="start" gap={token.margin} style={{ width: '100%' }}>
        <BookCover coverUrl={book.coverUrl} title={book.title} />
        {/* flex: 1 lets this column take the rest of the row; minWidth: 0
            overrides the flex item's default content-based floor, so long
            text wraps instead of forcing horizontal scroll at phone
            width. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Title level={2} style={{ marginTop: 0 }}>
            {book.title}
          </Typography.Title>

          <Space size={token.marginSM} wrap>
            <Space size={4} wrap>
              {book.authors.map((author, index) => (
                <Space key={author.id} size={4}>
                  <AccountAvatar
                    avatarUrl={author.avatarUrl}
                    name={`${author.firstName} ${author.lastName}`}
                    size="small"
                  />
                  <Typography.Text>
                    {`${author.firstName} ${author.lastName}${
                      index < book.authors.length - 1 ? ',' : ''
                    }`}
                  </Typography.Text>
                </Space>
              ))}
            </Space>
            <Tag color={isDraft ? 'orange' : undefined}>
              {BOOK_STATUS_LABELS[book.status]}
            </Tag>
            {/* Only for a Co-author: a Moderator reaches the edit page by
                its address, the way they reach a draft. */}
            {isCoAuthor && <Link to={`/books/${book.id}/edit`}>Edit</Link>}
            {book.series && (
              <Link to={`/search?series=${book.series.id}`}>
                {book.series.title}
              </Link>
            )}
            {book.genre !== null && (
              <Link to={`/search?genre=${book.genre.id}`}>
                {book.genre.name}
              </Link>
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
        </div>
      </Flex>

      <Divider />

      <Typography.Title level={3}>Chapters</Typography.Title>
      <ChapterList
        bookId={bookId}
        // The public list: only what is out, even for a Co-author, who
        // manages the rest from the edit page.
        items={publishedChapters(chapters.data?.items ?? [])}
        isPending={chapters.isPending}
        isError={chapters.isError}
      />

      <Divider />

      <CommentSection bookId={bookId} closed={isDraft} />
    </article>
  );
};
