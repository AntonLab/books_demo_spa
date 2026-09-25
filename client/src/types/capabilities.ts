import type { BookStatus } from 'shared';
import { isModeratorRole } from 'shared';
import type { PublicUser } from './user';

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
  return {
    isCoAuthor,
    // A Co-author or a Moderator: the form, the order, the delete.
    mayEdit: isCoAuthor || isModeratorRole(session?.role),
  };
};

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
  };
};
