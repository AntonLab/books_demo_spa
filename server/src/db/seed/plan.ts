import {
  REPLY_COMMENTS,
  TOP_LEVEL_COMMENTS,
  chapterText,
  chapterTitles,
  description,
} from './content.ts';
import {
  AUTHORS,
  READERS,
  STAFF,
  type AccountSpec,
  type AuthorSpec,
} from './personas.ts';
import { itemAt, type Rng } from './rng.ts';
import type { BookStatus } from '../../types/book.ts';
import type { Tombstone } from '../../types/comment.ts';

// The span each author's back catalogue is stretched over, ending a few days
// ago. The chapter cadence is *derived* from this rather than fixed: an author
// with ~190 chapters cannot publish one every 3-10 days inside 14 months, so
// the window wins and the gaps scale to fit (see layOutTimeline).
const PUBLICATION_WINDOW_DAYS = 430;

// How many books are credited to two authors rather than one (see shareBooks).
const SHARED_BOOK_COUNT = 2;

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlannedChapter {
  title: string;
  text: string;
  createdAt: Date;
  // The Publication time: null for a Draft chapter, a future moment for a
  // Scheduled one. Set by publicationOf in planAuthor.
  publishedAt: Date | null;
}

export interface PlannedBook {
  title: string;
  description: string;
  tags: string[];
  // Every Co-author in credit order, the author it was planned under first.
  coAuthorLogins: string[];
  // An index into the author's own series list, or null for a standalone book.
  seriesIndex: number | null;
  status: BookStatus;
  createdAt: Date;
  chapters: PlannedChapter[];
}

export interface PlannedSeries {
  title: string;
  description: string;
  tags: string[];
  // Every Co-author in credit order, the author it was planned under first.
  coAuthorLogins: string[];
  createdAt: Date;
}

// Accounts are referenced by their position in Plan.accounts, not by id: no row
// exists while the plan is being built.
export interface PlannedComment {
  book: PlannedBook;
  accountIndex: number;
  text: string;
  createdAt: Date;
  depth: number;
  parent: PlannedComment | null;
}

export interface PlannedLike {
  book: PlannedBook | null;
  comment: PlannedComment | null;
  accountIndex: number;
  isLike: boolean;
  createdAt: Date;
}

export interface PlannedAuthor {
  spec: AuthorSpec;
  createdAt: Date;
  series: PlannedSeries[];
  books: PlannedBook[];
}

export interface Plan {
  accounts: { spec: AccountSpec; createdAt: Date }[];
  authors: PlannedAuthor[];
  comments: PlannedComment[];
  // Kept beside the comments rather than on them, so a PlannedComment stays a
  // plain description of what was written and nothing has to be mutated after
  // the tree is built.
  tombstones: Map<PlannedComment, Tombstone>;
  likes: PlannedLike[];
}

// Lays an author's whole history out over PUBLICATION_WINDOW_DAYS, ending a few
// days ago so the newest chapter is genuinely new.
//
// The gaps are generated as relative weights and then scaled to fit the window,
// rather than drawn in days directly. That is the only way to honour both the
// window and "books are published one after another": ~190 chapters even at
// three days apart would span more than three years.
function layOutTimeline(rng: Rng, chapterCounts: readonly number[]): Date[][] {
  const weights: number[] = [];

  chapterCounts.forEach((count, bookIndex) => {
    if (bookIndex > 0) {
      // Four chapter-gaps' worth of silence between finishing one book and
      // starting the next.
      weights.push(4 * rng.float(0.6, 1.4));
    }
    for (let i = 1; i < count; i += 1) {
      weights.push(rng.float(0.6, 1.4));
    }
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const spanDays = PUBLICATION_WINDOW_DAYS - rng.int(0, 40);
  // Guards the degenerate single-chapter case, which the brief cannot produce
  // but which would otherwise divide by zero.
  const msPerWeight = totalWeight === 0 ? 0 : (spanDays * DAY_MS) / totalWeight;

  let cursor = Date.now() - rng.int(2, 5) * DAY_MS - spanDays * DAY_MS;
  let step = 0;

  return chapterCounts.map((count, bookIndex) => {
    if (bookIndex > 0) {
      cursor += itemAt(weights, step, 'timeline weight') * msPerWeight;
      step += 1;
    }

    const dates = [new Date(cursor)];
    for (let i = 1; i < count; i += 1) {
      cursor += itemAt(weights, step, 'timeline weight') * msPerWeight;
      step += 1;
      dates.push(new Date(cursor));
    }
    return dates;
  });
}

function planAuthor(rng: Rng, spec: AuthorSpec): PlannedAuthor {
  const { bank } = spec;
  const seriesCount = rng.int(1, 2);
  const standaloneCount = rng.int(1, 3);

  // Books of one series stay contiguous in time, and the blocks are then
  // shuffled: an author finishes a series, writes something standalone, starts
  // the next series. That is what keeps "newest chapters" on the front page
  // from being three books by the same person.
  const blocks: { seriesIndex: number | null; size: number }[] = [];
  for (let i = 0; i < seriesCount; i += 1) {
    blocks.push({ seriesIndex: i, size: rng.int(4, 5) });
  }
  for (let i = 0; i < standaloneCount; i += 1) {
    blocks.push({ seriesIndex: null, size: 1 });
  }

  const slots = rng
    .shuffle(blocks)
    .flatMap((block) =>
      Array.from({ length: block.size }, () => block.seriesIndex)
    );

  const chapterCounts = slots.map(() => rng.int(20, 24));
  const timeline = layOutTimeline(rng, chapterCounts);
  // One shuffled deck per author, so no author repeats a book title.
  const titles = rng.shuffle(bank.bookTitles);

  // The newest book is still a Draft; the one before it, and every book of the
  // series the draft belongs to, is In progress; everything older is Complete.
  // `slots` is in timeline order, so "newest" is simply the last one.
  const last = slots.length - 1;
  const ongoingSeries = slots[last];
  const statusOf = (index: number): BookStatus => {
    if (index === last) return 'draft';
    if (index === last - 1) return 'in_progress';
    if (ongoingSeries !== null && slots[index] === ongoingSeries) {
      return 'in_progress';
    }
    return 'complete';
  };

  // Which chapters are not out yet, counted from the end of the book. A draft
  // keeps its last two as Draft chapters. Every In progress book has its next
  // chapter Scheduled over the coming days, and the author's newest one out has
  // its next two — the "coming soon" a front page wants. Everything else was
  // published when it was written.
  const now = Date.now();
  const publicationOf = (
    index: number,
    chapterIndex: number,
    count: number,
    createdAt: Date
  ): Date | null => {
    const fromEnd = count - 1 - chapterIndex;
    const status = statusOf(index);
    if (status === 'draft') return fromEnd < 2 ? null : createdAt;
    if (status === 'in_progress') {
      const scheduled = index === last - 1 ? 2 : 1;
      if (fromEnd < scheduled) {
        // The later chapter comes out later: day 1-2 for the first, 3-4 for
        // the one after it.
        const day = (scheduled - fromEnd) * 2 - 1 + rng.int(0, 1);
        return new Date(now + day * DAY_MS + rng.int(8, 20) * 60 * 60 * 1000);
      }
    }
    return createdAt;
  };

  const books: PlannedBook[] = slots.map((seriesIndex, index) => {
    const dates = itemAt(timeline, index, 'chapter timeline');
    const chapters = chapterTitles(rng, bank, dates.length).map(
      (title, chapterIndex) => {
        const writtenAt = itemAt(dates, chapterIndex, 'chapter date');
        return {
          title,
          text: chapterText(rng, bank),
          createdAt: writtenAt,
          publishedAt: publicationOf(
            index,
            chapterIndex,
            dates.length,
            writtenAt
          ),
        };
      }
    );

    return {
      title: itemAt(titles, index, 'book title'),
      description: description(rng, bank, rng.int(3, 4)),
      tags: rng.sample(bank.tags, rng.int(3, 5)),
      coAuthorLogins: [spec.login],
      seriesIndex,
      status: statusOf(index),
      // The record exists a few days before chapter one does.
      createdAt: new Date(
        itemAt(dates, 0, 'first chapter date').getTime() -
          rng.int(1, 5) * DAY_MS
      ),
      chapters,
    };
  });

  // Each series predates its own first book; the account predates all of it.
  const series: PlannedSeries[] = Array.from(
    { length: seriesCount },
    (_, index) => {
      const first =
        books.find((book) => book.seriesIndex === index) ??
        itemAt(books, 0, 'book');
      return {
        title: itemAt(bank.seriesTitles, index, 'series title'),
        description: description(rng, bank, rng.int(3, 4)),
        tags: rng.sample(bank.tags, rng.int(3, 5)),
        coAuthorLogins: [spec.login],
        createdAt: new Date(
          first.createdAt.getTime() - rng.int(2, 10) * DAY_MS
        ),
      };
    }
  );

  const earliest = Math.min(...books.map((book) => book.createdAt.getTime()));

  return {
    spec,
    createdAt: new Date(earliest - rng.int(60, 110) * DAY_MS),
    series,
    books,
  };
}

// The last author's first series gains the first author as a second
// Co-author. Its books stay credited to the last author alone: a series and
// the books in it keep independent Co-author lists.
function shareSeries(authors: readonly PlannedAuthor[]): PlannedAuthor[] {
  const last = authors.length - 1;
  const partner = itemAt(authors, 0, 'author').spec.login;

  return authors.map((author, index) =>
    index !== last
      ? author
      : {
          ...author,
          series: author.series.map((entry, seriesIndex) =>
            seriesIndex === 0
              ? { ...entry, coAuthorLogins: [...entry.coAuthorLogins, partner] }
              : entry
          ),
        }
  );
}

// Two standalone books gain a second Co-author: each author's last standalone
// book is shared with the next author in AUTHORS. Standalone, so neither book
// has to be filed under a series its new Co-author is not credited on.
function shareBooks(authors: readonly PlannedAuthor[]): PlannedAuthor[] {
  return authors.map((author, index) => {
    if (index >= SHARED_BOOK_COUNT) return author;

    const partner = itemAt(authors, (index + 1) % authors.length, 'author').spec
      .login;
    const shared = author.books
      .filter((book) => book.seriesIndex === null)
      .at(-1);
    return {
      ...author,
      books: author.books.map((book) =>
        book === shared
          ? { ...book, coAuthorLogins: [...book.coAuthorLogins, partner] }
          : book
      ),
    };
  });
}

function planThreads(
  rng: Rng,
  books: readonly PlannedBook[],
  accounts: Plan['accounts']
): Pick<Plan, 'comments' | 'tombstones' | 'likes'> {
  const comments: PlannedComment[] = [];
  const likes: PlannedLike[] = [];
  const now = Date.now();
  const accountIndexes = accounts.map((_, i) => i);
  const registeredBy = (time: number): number[] =>
    accountIndexes.filter(
      (i) => itemAt(accounts, i, 'account').createdAt.getTime() <= time
    );
  // Nobody reacts before their account exists: a reader who registered last
  // month likes a two-year-old book last month, not two years ago.
  const reactionTime = (accountIndex: number, earliest: number): Date =>
    new Date(
      rng.float(
        Math.max(
          earliest,
          itemAt(accounts, accountIndex, 'account').createdAt.getTime()
        ),
        now
      )
    );

  for (const book of books) {
    // Nobody comments on or likes a Draft book, so the seed writes neither.
    if (book.status === 'draft') continue;

    // Readers arrive once there is something to read; the third chapter is a
    // reasonable stand-in for "this book has started".
    const from = itemAt(
      book.chapters,
      Math.min(2, book.chapters.length - 1),
      'chapter'
    ).createdAt.getTime();
    const to = now - 6 * 60 * 60 * 1000;

    // Sorted, so a reply is only ever chosen from comments that already exist —
    // which is what keeps a reply's timestamp after its parent's.
    const times = Array.from({ length: rng.int(3, 15) }, () =>
      rng.float(from, to)
    ).sort((a, b) => a - b);

    // One shuffled deck of each bank per book, consumed in order: two
    // identical comments under the same book read as a bug rather than as two
    // readers agreeing. Across books a repeat is fine, and expected.
    const topLevel = rng.shuffle(TOP_LEVEL_COMMENTS);
    const replies = rng.shuffle(REPLY_COMMENTS);
    let nextTopLevel = 0;
    let nextReply = 0;

    const inBook: PlannedComment[] = [];

    for (const time of times) {
      // Roughly one in three is a reply, and only to something shallow enough
      // to leave the thread three levels deep at most.
      const candidates = inBook.filter((candidate) => candidate.depth < 2);
      const parent =
        candidates.length > 0 && rng.chance(1 / 3)
          ? rng.pick(candidates)
          : null;

      const comment: PlannedComment = {
        book,
        // Any account that existed by then, the book's own author included.
        // Never empty: the staff predate every author, and so every book.
        accountIndex: rng.pick(registeredBy(time)),
        // The modulo only matters if a bank is ever made smaller than the
        // 15 comments a book can hold.
        text:
          parent === null
            ? itemAt(
                topLevel,
                nextTopLevel++ % topLevel.length,
                'top-level comment'
              )
            : itemAt(replies, nextReply++ % replies.length, 'reply'),
        createdAt: new Date(time),
        depth: parent === null ? 0 : parent.depth + 1,
        parent,
      };

      inBook.push(comment);
      comments.push(comment);
    }

    // 3-7 of the accounts not credited on the book like it, distinct by
    // construction so the unique index on (userId, bookId) is never tested by
    // a duplicate. No Co-author may like their own book, and the API would
    // refuse it, so the seed does not write one either.
    const likers = accountIndexes.filter(
      (index) =>
        !book.coAuthorLogins.includes(
          itemAt(accounts, index, 'account').spec.login
        )
    );
    for (const accountIndex of rng.sample(likers, rng.int(3, 7))) {
      likes.push({
        book,
        comment: null,
        accountIndex,
        isLike: !rng.chance(0.15),
        createdAt: reactionTime(accountIndex, from),
      });
    }
  }

  // Tombstones only on comments that have a reply: the whole point of a
  // tombstone is that the thread below it keeps its place. Half deleted by
  // their owner, half removed by a moderator — the second kind is the one
  // POST /api/comments/:id/restore can undo.
  const parents = comments.filter((comment) =>
    comments.some((other) => other.parent === comment)
  );
  const tombstones = new Map<PlannedComment, Tombstone>(
    rng
      .shuffle(parents)
      .slice(0, Math.min(parents.length, Math.round(comments.length / 20)))
      .map((comment, index) => [
        comment,
        index % 2 === 0 ? 'deleted' : 'removed',
      ])
  );

  // Likes on comments come after the tombstones, so a withheld comment does not
  // carry a like count for text nobody can read. The comment's own author is
  // left out, as the API would refuse their like.
  for (const comment of comments) {
    if (tombstones.has(comment)) {
      continue;
    }
    const likers = accountIndexes.filter(
      (index) => index !== comment.accountIndex
    );
    for (const accountIndex of rng.sample(likers, rng.int(0, 4))) {
      likes.push({
        book: null,
        comment,
        accountIndex,
        isLike: !rng.chance(0.15),
        createdAt: reactionTime(accountIndex, comment.createdAt.getTime()),
      });
    }
  }

  return { comments, tombstones, likes };
}

export function buildPlan(rng: Rng): Plan {
  const authors = shareSeries(
    shareBooks(AUTHORS.map((spec) => planAuthor(rng, spec)))
  );
  const earliest = Math.min(
    ...authors.map((author) => author.createdAt.getTime())
  );

  // Staff predate every author; readers arrive across the whole period, so the
  // users list is not ten accounts created the same afternoon.
  const accounts: Plan['accounts'] = [
    ...STAFF.map((spec) => ({
      spec,
      createdAt: new Date(earliest - rng.int(30, 90) * DAY_MS),
    })),
    ...authors.map((author) => ({
      spec: author.spec,
      createdAt: author.createdAt,
    })),
    ...READERS.map((spec) => ({
      spec,
      createdAt: new Date(rng.float(earliest, Date.now() - 30 * DAY_MS)),
    })),
  ];

  const threads = planThreads(
    rng,
    authors.flatMap((author) => author.books),
    accounts
  );

  return { accounts, authors, ...threads };
}
