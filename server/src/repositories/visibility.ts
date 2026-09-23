import type { Request } from 'express';
import { literal, Op, type IncludeOptions, type WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { UnauthorizedError } from '../types/errors.ts';
import type { Role } from '../types/permission.ts';

// Who is reading, as far as Draft books are concerned: the signed-in account's
// id and Role, or null for a Guest. Passed to every repository read that can
// reach a book, so the rule lives in the query rather than in each controller.
export type Viewer = { id: number; role: Role } | null;

// The account behind a write, for the notifications it raises. Every route
// that calls this is guarded, so an unset req.user here is a wiring mistake
// and is refused as one.
export function actorOf(req: Request): { id: number; role: Role } {
  if (!req.user) throw new UnauthorizedError();
  return { id: req.user.id, role: req.user.role };
}

// A Moderator reads every Draft book, but only by direct link: no list is
// widened for one.
function isModerator(viewer: Viewer): boolean {
  return viewer?.role === 'admin' || viewer?.role === 'superadmin';
}

// The books a viewer may read, as a WHERE on `books`: every Published book,
// plus the Draft books the viewer co-authors — or every book at all for a
// Moderator. The one definition every read that can reach a book goes through:
// a book's own detail, and the chapters, comments and likes hanging off it.
export async function readableBookWhere(viewer: Viewer): Promise<WhereOptions> {
  if (isModerator(viewer)) return {};

  const published: WhereOptions = { status: { [Op.ne]: 'draft' } };
  if (viewer === null) return published;

  const credited = await BookAuthor.findAll({
    where: { userId: viewer.id },
    attributes: ['bookId'],
  });
  if (credited.length === 0) return published;

  return {
    [Op.or]: [published, { id: credited.map((credit) => credit.bookId) }],
  };
}

// An inner join on a row's `book` association, carrying no columns of its own:
// it only drops the rows — chapters, comments — that hang off a Draft book the
// viewer may not read.
export async function readableBookInclude(
  viewer: Viewer
): Promise<IncludeOptions> {
  return {
    model: Book,
    as: 'book',
    attributes: [],
    required: true,
    where: await readableBookWhere(viewer),
  };
}

// The same rule turned inside out: the ids of the Draft books a viewer may not
// read. For the reads that cannot join a single `book` — a like points at a
// book or at a comment on one — excluding the few hidden drafts is simpler
// than enumerating every readable book.
export async function hiddenBookIds(viewer: Viewer): Promise<number[]> {
  if (isModerator(viewer)) return [];

  const credited =
    viewer === null
      ? []
      : (
          await BookAuthor.findAll({
            where: { userId: viewer.id },
            attributes: ['bookId'],
          })
        ).map((credit) => credit.bookId);

  const drafts = await Book.findAll({
    where: {
      status: 'draft',
      ...(credited.length > 0 ? { id: { [Op.notIn]: credited } } : {}),
    },
    attributes: ['id'],
  });
  return drafts.map((book) => book.id);
}

// The series a viewer may see, as a WHERE on `series`: every series holding at
// least one Published book, plus the series the viewer co-authors — or every
// series for a Moderator. A series has no status of its own; an empty or
// all-draft one simply has nothing a reader could open yet.
//
// The published side is a subquery rather than an id list, because it grows
// with the whole catalogue. It carries no caller-supplied value, so there is
// nothing to bind.
export async function visibleSeriesWhere(
  viewer: Viewer
): Promise<WhereOptions> {
  if (isModerator(viewer)) return {};

  const withPublishedBook: WhereOptions = {
    id: {
      [Op.in]: literal(
        "(SELECT DISTINCT `seriesId` FROM `books` WHERE `status` <> 'draft' AND `seriesId` IS NOT NULL)"
      ),
    },
  };
  if (viewer === null) return withPublishedBook;

  const credited = await SeriesAuthor.findAll({
    where: { userId: viewer.id },
    attributes: ['seriesId'],
  });
  if (credited.length === 0) return withPublishedBook;

  return {
    [Op.or]: [
      withPublishedBook,
      { id: credited.map((credit) => credit.seriesId) },
    ],
  };
}

// The viewer a request reads as. requirePermission sets req.user whenever a
// session resolves, public reads included, so an unset one really is a Guest.
export function viewerOf(user: { id: number; role: Role } | undefined): Viewer {
  return user ? { id: user.id, role: user.role } : null;
}

// The chapters a viewer may read, as a WHERE on `chapters` and an inner join on
// the chapter's book. A reader needs both halves: a Published book, and a
// Publication time that has passed. A Co-author of the book reads every chapter
// in it — drafts and scheduled ones are theirs to work on — and a Moderator
// reads everything.
//
// "Now" is this process's clock, the same one that stamps `publishedAt: 'now'`,
// so a chapter published immediately is readable on the very next request and
// a scheduled one comes out without anything having to flip it.
export async function readableChapterScope(
  viewer: Viewer
): Promise<{ where: WhereOptions; include: IncludeOptions }> {
  const include = await readableBookInclude(viewer);
  if (isModerator(viewer)) return { where: {}, include };

  const published: WhereOptions = { publishedAt: { [Op.lte]: new Date() } };
  const credited = await creditedBookIds(viewer);
  if (credited.length === 0) return { where: published, include };

  return {
    where: { [Op.or]: [published, { bookId: credited }] },
    include,
  };
}

async function creditedBookIds(viewer: Viewer): Promise<number[]> {
  if (viewer === null) return [];
  const credits = await BookAuthor.findAll({
    where: { userId: viewer.id },
    attributes: ['bookId'],
  });
  return credits.map((credit) => credit.bookId);
}
