import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  App,
  Button,
  Divider,
  Empty,
  Flex,
  Skeleton,
  Space,
  Tabs,
  Tag,
  theme,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { BookCover } from '@/components/molecules/BookCover/BookCover';
import { BookLibraryCounts } from '@/components/molecules/BookLibraryCounts/BookLibraryCounts';
import { ReadingStatusSelect } from '@/components/molecules/ReadingStatusSelect/ReadingStatusSelect';
import { FavoriteButton } from '@/components/molecules/FavoriteButton/FavoriteButton';
import { GenrePath } from '@/components/molecules/GenrePath/GenrePath';
import { LikeButton } from '@/components/molecules/LikeButton/LikeButton';
import { TagList } from '@/components/molecules/TagList/TagList';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { BookStatistics } from '@/components/organisms/BookStatistics/BookStatistics';
import { BookUnsavedTextNotices } from '@/components/organisms/BookUnsavedTextNotices/BookUnsavedTextNotices';
import { ChapterList } from '@/components/organisms/ChapterList/ChapterList';
import { CommentSection } from '@/components/organisms/CommentSection/CommentSection';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapters } from '@/queries/chapters';
import { useToggleFavorite } from '@/queries/favorites';
import { queryKeys } from '@/queries/keys';
import { useSetReadingStatus } from '@/queries/library';
import { useToggleLike } from '@/queries/likes';
import { BOOK_STATUS_COLORS, BOOK_STATUS_LABELS } from '@/types/book';
import { publishedChapters } from '@/types/chapter';
import { bookCapabilities } from '@/types/capabilities';
import { entriesOfBook } from '@/store/unsavedTextSlice';
import { useOwnUnsavedEntries } from '@/store/useUnsavedText';
import spacing from '@/theme/spacing.module.css';
import styles from './BookPage.module.css';

const BOOK_GONE = 'This book no longer exists.';

export const BookPage: FC = () => {
  const bookId = Number(useParams().id);
  // Not an id the server could answer for (an old /books/new bookmark), so it
  // is not asked.
  return Number.isInteger(bookId) && bookId > 0 ? (
    <BookView bookId={bookId} />
  ) : (
    <GoneRedirect message={BOOK_GONE} />
  );
};

const BookView: FC<{ bookId: number }> = ({ bookId }) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data: session } = useSession();
  const { data: book, isPending, isError, error } = useBook(bookId);
  // Fetched in parallel with the book rather than after it: neither section
  // needs the detail response to know what to ask for.
  const chapters = useChapters(bookId);
  const toggleLike = useToggleLike(queryKeys.book(bookId));
  const toggleFavorite = useToggleFavorite(queryKeys.book(bookId));
  const setStatus = useSetReadingStatus();
  const { message } = App.useApp();
  const toastError = (error: Error) => void message.error(error.message);

  const unsavedEntries = useOwnUnsavedEntries();
  const hasUnsavedText = entriesOfBook(unsavedEntries, bookId).length > 0;

  if (isError) {
    const isGone = error instanceof ApiError && error.status === 404;
    // Its Unsaved text keeps the page open: the notices are the only way to
    // copy it out.
    if (isGone && !hasUnsavedText) return <GoneRedirect message={BOOK_GONE} />;
    return (
      <>
        <Alert
          type="error"
          title="Could not load this book."
          className={spacing.gapBelow}
        />
        {isGone && <BookUnsavedTextNotices bookId={bookId} />}
      </>
    );
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  // Nobody comments on a Draft book; the server answers 403 either way.
  const isDraft = book.status === 'draft';
  const { isCoAuthor, mayEdit, mayLike, mayFavorite, mayKeepInLibrary } =
    bookCapabilities(book, session);
  // The public list: only what is out, even for a Co-author, who manages the
  // rest from the Edit modal. The Chapters and Statistics tabs share it, so
  // they cannot disagree about what is out.
  const published = publishedChapters(chapters.data?.items ?? []);

  return (
    <article>
      {/* The chapter pages turn this Account away, so this is the only place
          its Unsaved text shows. */}
      {!mayEdit && <BookUnsavedTextNotices bookId={bookId} />}
      {/* Flex, not Space: Space wraps each child in a div.ant-space-item
          that carries no flex rule of its own, so a flex style on a child
          beneath it does nothing. Flex's children are the flex items
          themselves. */}
      <Flex align="start" gap={token.margin} className={styles.row}>
        <BookCover coverUrl={book.coverUrl} title={book.title} />
        {/* flex: 1 lets this column take the rest of the row; minWidth: 0
            overrides the flex item's default content-based floor, so long
            text wraps instead of forcing horizontal scroll at phone
            width. */}
        <div className={styles.body}>
          <Typography.Title level={2} className={styles.title}>
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
            <Tag color={BOOK_STATUS_COLORS[book.status]}>
              {BOOK_STATUS_LABELS[book.status]}
            </Tag>
            {mayEdit && (
              <Button size="small" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {book.series && (
              <Link to={`/series/${book.series.id}`}>{book.series.title}</Link>
            )}
            {book.genre !== null && <GenrePath genre={book.genre} />}
            {mayLike && (
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
            {mayFavorite && (
              <FavoriteButton
                count={book.favoriteCount}
                favoriteId={book.viewerFavoriteId}
                // A second click before the refetch lands would send the
                // same add twice and meet a 409.
                disabled={toggleFavorite.isPending}
                onToggle={(existingId) =>
                  toggleFavorite.mutate({
                    existingId,
                    payload: { bookId: book.id },
                  })
                }
              />
            )}
            {mayKeepInLibrary && (
              <ReadingStatusSelect
                // Its own id: rc-component's generated ids all read `test-id`
                // under Jest, and this select would then name any modal whose
                // title is labelled by that id.
                id="book-reading-status"
                value={book.viewerReadingStatus}
                disabled={setStatus.isPending}
                onChange={(status) =>
                  setStatus.mutate(
                    { bookId: book.id, status },
                    { onError: toastError }
                  )
                }
              />
            )}
          </Space>

          <BookLibraryCounts counts={book.libraryCounts} />

          {book.tags.length > 0 && (
            <div className={styles.tags}>
              <TagList tags={book.tags} />
            </div>
          )}
        </div>
      </Flex>

      {/* Uncontrolled: the open tab is this page's own state (ADR-0010) and
          never reaches the URL, so a reload opens Description. */}
      <Tabs
        className={styles.tabs}
        classNames={{ body: styles.tabsBody }}
        items={[
          {
            key: 'description',
            label: 'Description',
            children:
              book.description.trim() === '' ? (
                <Empty description="No description yet." />
              ) : (
                <Typography.Paragraph>{book.description}</Typography.Paragraph>
              ),
          },
          {
            key: 'chapters',
            label: 'Chapters',
            children: (
              <ChapterList
                bookId={bookId}
                items={published}
                isPending={chapters.isPending}
                isError={chapters.isError}
              />
            ),
          },
          {
            key: 'statistics',
            label: 'Statistics',
            children: (
              <BookStatistics
                book={book}
                chapters={published}
                isPending={chapters.isPending}
                isError={chapters.isError}
              />
            ),
          },
        ]}
      />

      <Divider />

      <CommentSection bookId={bookId} closed={isDraft} />

      {editing && (
        <BookEditDetailsModal
          bookId={bookId}
          onClose={() => setEditing(false)}
          onGone={() => void navigate(isCoAuthor ? '/profile/my-books' : '/')}
        />
      )}
    </article>
  );
};
