import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import { Alert, Skeleton } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { EDIT_PARAM, EDIT_PARAM_OPEN } from '@/constants/editParam';
import { BOOK_GONE } from '@/constants/goneMessages';
import { isId } from '@/types/id';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { BookLibraryCounts } from '@/components/molecules/BookLibraryCounts/BookLibraryCounts';
import { BookCard } from '@/components/organisms/BookCard/BookCard';
import { BookEditDetailsModal } from '@/components/organisms/BookEditDetailsModal/BookEditDetailsModal';
import { BookUnsavedTextNotices } from '@/components/organisms/BookUnsavedTextNotices/BookUnsavedTextNotices';
import { useBookReadingLists } from '@/components/organisms/BookReadingListsTab/useBookReadingLists';
import { useSession } from '@/queries/auth';
import { useBook } from '@/queries/books';
import { useChapters } from '@/queries/chapters';
import { bookCapabilities } from '@/types/capabilities';
import { entriesOfBook } from '@/store/unsavedTextSlice';
import { useRecordRecentlyViewed } from '@/store/useRecentlyViewed';
import { useOwnUnsavedEntries } from '@/store/useUnsavedText';
import spacing from '@/theme/spacing.module.css';
import { BookActions } from './BookActions';
import { BookSections } from './BookSections';

export const BookPage: FC = () => {
  const bookId = Number(useParams().id);
  // Not an id the server could answer for (an old /books/new bookmark), so it
  // is not asked.
  return isId(bookId) ? (
    <BookView bookId={bookId} />
  ) : (
    <GoneRedirect message={BOOK_GONE} />
  );
};

// A child, since the early returns in BookView leave no room for a hook that
// needs `mayEdit`.
// The caller's `onDrop` is a new function every render; the ref keeps the
// latest one so the effect runs once on mount, not on every render.
const DropEditParam: FC<{ onDrop: () => void }> = ({ onDrop }) => {
  const latest = useRef(onDrop);
  useEffect(() => {
    latest.current = onDrop;
  });
  useEffect(() => latest.current(), []);
  return null;
};

// Edit pushes (Back closes); closing and the non-editor strip replace.
const useEditParam = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = searchParams.get(EDIT_PARAM) === EDIT_PARAM_OPEN;
  const setEditing = (open: boolean) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set(EDIT_PARAM, EDIT_PARAM_OPEN);
        else next.delete(EDIT_PARAM);
        return next;
      },
      { replace: !open }
    );
  return { editing, setEditing };
};

const BookLoadError: FC<{ bookId: number; error: Error }> = ({
  bookId,
  error,
}) => {
  const unsavedEntries = useOwnUnsavedEntries();
  const hasUnsavedText = entriesOfBook(unsavedEntries, bookId).length > 0;
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
};

const BookView: FC<{ bookId: number }> = ({ bookId }) => {
  const navigate = useNavigate();
  const { editing, setEditing } = useEditParam();

  const { data: session } = useSession();
  const { data: book, isPending, isError, error } = useBook(bookId);
  useRecordRecentlyViewed(book);
  // Fetched in parallel with the book rather than after it: neither section
  // needs the detail response to know what to ask for.
  const chapters = useChapters(bookId);
  const readingLists = useBookReadingLists(bookId);

  if (isError) return <BookLoadError bookId={bookId} error={error} />;
  if (isPending) return <Skeleton active paragraph={{ rows: 6 }} />;

  const capabilities = bookCapabilities(book, session);
  const { isCoAuthor, mayEdit } = capabilities;

  return (
    <article>
      {/* The chapter pages turn this Account away, so this is the only place
          its Unsaved text shows. */}
      {!mayEdit && <BookUnsavedTextNotices bookId={bookId} />}
      <BookCard book={book} heading />

      <BookActions
        book={book}
        session={session}
        capabilities={capabilities}
        onEdit={() => setEditing(true)}
      />

      <BookLibraryCounts counts={book.libraryCounts} />

      <BookSections
        book={book}
        chapters={chapters}
        readingLists={readingLists}
      />

      {editing && !mayEdit && session !== undefined && (
        <DropEditParam onDrop={() => setEditing(false)} />
      )}
      {editing && mayEdit && (
        <BookEditDetailsModal
          bookId={bookId}
          onClose={() => setEditing(false)}
          onGone={() => void navigate(isCoAuthor ? '/profile/my-books' : '/')}
        />
      )}
    </article>
  );
};
