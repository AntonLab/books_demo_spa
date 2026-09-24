import type * as Shared from 'shared';
import type { BookSort, BookStatus, Wire } from 'shared';

// The server's BOOK_STATUSES, from the shared workspace (ADR-0006). Only
// `draft` keeps a book from readers; see CONTEXT.md.
export {
  BOOK_SORTS,
  BOOK_STATUSES,
  type BookSort,
  type BookStatus,
} from 'shared';

// What each ranking is called, both as a main page section and as the search
// page it leads to.
export const BOOK_SORT_LABELS: Record<BookSort, string> = {
  popular: 'Popular',
  new: 'New releases',
  updated: 'Recently updated',
};

// What a reader sees for each status. Kept beside the type so every place that
// shows a status says the same words.
export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  complete: 'Complete',
};

// No userId: a book has no single owner (ADR-0005). Every Co-author comes
// embedded as `authors`, in credit order, in the list as well as the detail,
// so a card can name them without another request.
export type PublicBook = Wire<Shared.PublicBook>;

// What GET /api/books/:id returns: the record plus the series name the book
// page shows and the like state it renders. `viewerLikeId` is null both for an
// anonymous visitor and for a signed-in one who has not liked this book; with
// no session the button is hidden outright.
export type BookDetail = Wire<Shared.BookDetail>;
