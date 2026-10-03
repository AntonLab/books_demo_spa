import { useState } from 'react';
import type { FC } from 'react';
import {
  CommentOutlined,
  EditOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Alert, App, Divider, Skeleton, Space, Tabs, theme } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/client';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { BookLibraryCounts } from '@/components/molecules/BookLibraryCounts/BookLibraryCounts';
import { ReadingStatusSelect } from '@/components/molecules/ReadingStatusSelect/ReadingStatusSelect';
import { FavoriteButton } from '@/components/molecules/FavoriteButton/FavoriteButton';
import { LikeButton } from '@/components/molecules/LikeButton/LikeButton';
import { AddToReadingList } from '@/components/organisms/AddToReadingList/AddToReadingList';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { BookStatistics } from '@/components/organisms/BookStatistics/BookStatistics';
import { BookUnsavedTextNotices } from '@/components/organisms/BookUnsavedTextNotices/BookUnsavedTextNotices';
import { BookReadingListsTab } from '@/components/organisms/BookReadingListsTab/BookReadingListsTab';
import { useBookReadingLists } from '@/components/organisms/BookReadingListsTab/useBookReadingLists';
import { ChapterList } from '@/components/organisms/ChapterList/ChapterList';
import { CommentSection } from '@/components/organisms/CommentSection/CommentSection';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapters } from '@/queries/chapters';
import { useToggleFavorite } from '@/queries/favorites';
import { queryKeys } from '@/queries/keys';
import { useSetReadingStatus } from '@/queries/library';
import { useToggleLike } from '@/queries/likes';
import { publishedChapters } from '@/types/chapter';
import {
  bookCapabilities,
  mayAddBookToReadingList,
} from '@/types/capabilities';
import { entriesOfBook } from '@/store/unsavedTextSlice';
import { useRecordRecentlyViewed } from '@/store/useRecentlyViewed';
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
  useRecordRecentlyViewed(book);
  // Fetched in parallel with the book rather than after it: neither section
  // needs the detail response to know what to ask for.
  const chapters = useChapters(bookId);
  const readingLists = useBookReadingLists(bookId);
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
  // No count until the first response is in, so no false (0) flashes.
  const readingListsLabel =
    readingLists.isPending || readingLists.error !== null
      ? 'Reading lists'
      : `Reading lists (${readingLists.total})`;

  return (
    <article>
      {/* The chapter pages turn this Account away, so this is the only place
          its Unsaved text shows. */}
      {!mayEdit && <BookUnsavedTextNotices bookId={bookId} />}
      <BookCard book={book} heading />

      <Space size={token.marginSM} wrap>
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
        {mayAddBookToReadingList(book, session) && (
          <AddToReadingList target={{ bookId: book.id }} />
        )}
        {mayEdit && (
          <IconButton
            type="text"
            size="small"
            label="Edit"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing(true)}
          />
        )}
      </Space>

      <BookLibraryCounts counts={book.libraryCounts} />

      {/* Uncontrolled: the open tab is this page's own state (ADR-0010) and
          never reaches the URL, so a reload opens Chapters. */}
      <Tabs
        className={styles.tabs}
        classNames={{ body: styles.tabsBody }}
        items={[
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

      {/* Uncontrolled like the set above: the open tab is page state
          (ADR-0010), so a reload opens Comments. No fixed body height: the
          thread grows with the page. */}
      <Tabs
        items={[
          {
            key: 'comments',
            icon: <CommentOutlined aria-hidden />,
            label: `Comments (${book.commentCount})`,
            children: <CommentSection bookId={bookId} closed={isDraft} />,
          },
          {
            key: 'readingLists',
            icon: <UnorderedListOutlined aria-hidden />,
            label: readingListsLabel,
            children: <BookReadingListsTab list={readingLists} />,
          },
        ]}
      />

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
