import type { BookStatus } from './book';
import { isModeratorRole, type PublicUser } from './user';

// What the viewer may do with a Book or Series, so a page shows only what the
// server would allow. The server refuses the rest regardless: it decides from
// the matrix scope and the credits (coAuthorGuard.ts, visibility.ts), and
// these answers mirror that for the Roles that exist today.

type Session = PublicUser | null | undefined;

interface Credited {
  authors: readonly { id: number }[];
}

const isCredited = (work: Credited, session: Session): boolean =>
  session != null && work.authors.some((author) => author.id === session.id);

export interface SeriesCapabilities {
  isCoAuthor: boolean;
  // A Co-author or a Moderator: the form, the order, the delete.
  mayEdit: boolean;
  // A Co-author only: a Moderator edits a work but never its byline.
  mayManageByline: boolean;
}

export interface BookCapabilities extends SeriesCapabilities {
  // Only a Co-author adds chapters: the matrix gives Moderators no create.
  mayAddChapter: boolean;
  // Signed in, not a Draft, not the viewer's own book.
  mayLike: boolean;
  // A Draft is for its Co-authors and Moderators; anything else is public.
  mayRead: boolean;
}

export const seriesCapabilities = (
  series: Credited,
  session: Session
): SeriesCapabilities => {
  const isCoAuthor = isCredited(series, session);
  return {
    isCoAuthor,
    mayEdit: isCoAuthor || isModeratorRole(session?.role),
    mayManageByline: isCoAuthor,
  };
};

export const bookCapabilities = (
  book: Credited & { status: BookStatus },
  session: Session
): BookCapabilities => {
  const shared = seriesCapabilities(book, session);
  const isDraft = book.status === 'draft';
  return {
    ...shared,
    mayAddChapter: shared.isCoAuthor,
    mayLike: session != null && !isDraft && !shared.isCoAuthor,
    mayRead: !isDraft || shared.mayEdit,
  };
};
