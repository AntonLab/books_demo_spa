import type { BookStatus } from 'shared';
import { isModeratorRole } from 'shared';
import type { PublicUser } from './api';

// What the viewer may do with a Book or Series, so a page shows only what the
// server would allow. The server refuses the rest regardless: it decides from
// the matrix scope and the credits (coAuthorGuard.ts, visibility.ts), and
// these answers mirror that for the Roles that exist today.
//
// isCoAuthor alone gates what a Moderator never does: the byline and adding
// chapters (the matrix gives Moderators no create).

type Session = PublicUser | null | undefined;

interface Credited {
  authors: readonly { id: number }[];
}

export const seriesCapabilities = (series: Credited, session: Session) => {
  const isCoAuthor =
    session != null &&
    series.authors.some((author) => author.id === session.id);
  // A Co-author keeps no own Work as a Favorite or in a Library: the server
  // refuses.
  const mayHoldAsReader = session != null && !isCoAuthor;
  return {
    isCoAuthor,
    // A Co-author or a Moderator: the form, the order, the delete.
    mayEdit: isCoAuthor || isModeratorRole(session?.role),
    mayFavorite: mayHoldAsReader,
    mayKeepInLibrary: mayHoldAsReader,
  };
};

export const readingListCapabilities = (
  list: { owner: { id: number } },
  session: Session
) => {
  const isOwner = session != null && list.owner.id === session.id;
  return {
    isOwner,
    // No Moderator override: a list is its owner's.
    mayEdit: isOwner,
    // Any signed-in Account but the owner, who already has it.
    mayCopy: session != null && !isOwner,
  };
};

export const mayAddBookToReadingList = (
  book: { status: BookStatus },
  session: Session
) => session != null && book.status !== 'draft';

// bookCount covers Published Books only, so it equals the server's rule for
// what a Series adds.
export const mayAddSeriesToReadingList = (
  series: { bookCount: number },
  session: Session
) => session != null && series.bookCount > 0;

export const bookCapabilities = (
  book: Credited & { status: BookStatus },
  session: Session
) => {
  const shared = seriesCapabilities(book, session);
  const isDraft = book.status === 'draft';
  return {
    ...shared,
    // Signed in, not a Draft, not the viewer's own book.
    mayLike: session != null && !isDraft && !shared.isCoAuthor,
    // A Draft is for its Co-authors and Moderators; anything else is public.
    mayRead: !isDraft || shared.mayEdit,
    // The server keeps a Draft's Favorites but counts and lists none of
    // them, so a star on a Draft would show a count that means nothing.
    // Not for a Co-author either, as for a Series.
    mayFavorite: shared.mayFavorite && !isDraft,
  };
};
