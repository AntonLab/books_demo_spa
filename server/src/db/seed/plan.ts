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
import {
  BAN_MARK_THRESHOLD,
  READING_STATUSES,
  REPORT_REASONS,
  type BookStatus,
  type ReadingStatus,
  type ReportReason,
  type ReportStatus,
  type Tombstone,
} from 'shared';

// The span each author's back catalogue is stretched over, ending a few days
// ago. The chapter cadence is *derived* from this rather than fixed: an author
// with ~190 chapters cannot publish one every 3-10 days inside 14 months, so
// the window wins and the gaps scale to fit (see layOutTimeline).
const PUBLICATION_WINDOW_DAYS = 430;

// How many books are credited to two authors rather than one (see shareBooks).
const SHARED_BOOK_COUNT = 2;

export const DAY_MS = 24 * 60 * 60 * 1000;

interface PlannedChapter {
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

interface PlannedLike {
  book: PlannedBook | null;
  comment: PlannedComment | null;
  accountIndex: number;
  isLike: boolean;
  createdAt: Date;
}

// Exactly one of book / series, as on a row of `favorites`.
interface PlannedFavorite {
  book: PlannedBook | null;
  series: PlannedSeries | null;
  accountIndex: number;
  createdAt: Date;
}

export interface PlannedLibraryEntry {
  book: PlannedBook;
  accountIndex: number;
  status: ReadingStatus;
  updatedAt: Date;
}

export interface PlannedReadingList {
  accountIndex: number;
  title: string;
  description: string;
  tags: string[];
  // Exactly one of book / series per item, in list order.
  items: (
    { book: PlannedBook; series: null } | { book: null; series: PlannedSeries }
  )[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlannedReport {
  comment: PlannedComment;
  reporterIndex: number | null; // null: a System report
  reason: ReportReason;
  explanation: string | null;
  status: ReportStatus;
  moderatorIndex: number | null;
  settledText: string | null;
  createdAt: Date;
  takenAt: Date | null;
  settledAt: Date | null;
}

export interface PlannedAuthor {
  spec: AuthorSpec;
  createdAt: Date;
  series: PlannedSeries[];
  books: PlannedBook[];
}

export interface Plan {
  accounts: { spec: AccountSpec; createdAt: Date; lastSeenAt: Date | null }[];
  authors: PlannedAuthor[];
  comments: PlannedComment[];
  // Kept beside the comments rather than on them, so a PlannedComment stays a
  // plain description of what was written and nothing has to be mutated after
  // the tree is built.
  tombstones: Map<PlannedComment, Tombstone>;
  likes: PlannedLike[];
  favorites: PlannedFavorite[];
  library: PlannedLibraryEntry[];
  readingLists: PlannedReadingList[];
  reports: PlannedReport[];
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

// What a reader can see: Books that are not Drafts, and Series holding one.
function shownWorks(rng: Rng, authors: readonly PlannedAuthor[]) {
  const now = Date.now();
  const books = authors
    .flatMap((author) => author.books)
    .filter((book) => book.status !== 'draft');
  const series = authors.flatMap((author) =>
    author.series.filter((_, seriesIndex) =>
      author.books.some(
        (book) => book.seriesIndex === seriesIndex && book.status !== 'draft'
      )
    )
  );
  // Nobody holds a work before their account, or the work, exists.
  const heldSince = (accountCreatedAt: Date, workCreatedAt: Date): Date =>
    new Date(
      rng.float(
        Math.max(accountCreatedAt.getTime(), workCreatedAt.getTime()),
        now
      )
    );
  return { books, series, heldSince, now };
}

// Readers only: each keeps 2-4 books and one series. A reader is never
// credited, so no Favorite lands on the holder's own work, and the API would
// answer a reader's Favorite on a Draft book, or on a series with no
// non-draft book, with a 404, so the seed writes neither.
function planFavorites(
  rng: Rng,
  authors: readonly PlannedAuthor[],
  accounts: Plan['accounts']
): PlannedFavorite[] {
  const { books, series, heldSince } = shownWorks(rng, authors);

  return accounts.flatMap((account, accountIndex) => {
    if (account.spec.role !== 'user') return [];

    // sample() draws distinct items, so the unique indexes on
    // (userId, bookId) and (userId, seriesId) are never tested by a repeat.
    const heldBooks = rng.sample(books, rng.int(2, 4)).map((book) => ({
      book,
      series: null,
      accountIndex,
      createdAt: heldSince(account.createdAt, book.createdAt),
    }));
    const heldSeries = rng.sample(series, 1).map((entry) => ({
      book: null,
      series: entry,
      accountIndex,
      createdAt: heldSince(account.createdAt, entry.createdAt),
    }));
    return [...heldBooks, ...heldSeries];
  });
}

// Readers only: each shelves 4-6 Published books. The statuses rotate from a
// random start, so a reader with four or more books holds every status.
function planLibrary(
  rng: Rng,
  authors: readonly PlannedAuthor[],
  accounts: Plan['accounts']
): PlannedLibraryEntry[] {
  const now = Date.now();
  const books = authors
    .flatMap((author) => author.books)
    .filter((book) => book.status !== 'draft');

  return accounts.flatMap((account, accountIndex) => {
    if (account.spec.role !== 'user') return [];

    const start = rng.int(0, READING_STATUSES.length - 1);
    return rng.sample(books, rng.int(4, 6)).map((book, position) => ({
      book,
      accountIndex,
      status: itemAt(
        READING_STATUSES,
        (start + position) % READING_STATUSES.length,
        'reading status'
      ),
      updatedAt: new Date(
        rng.float(
          Math.max(account.createdAt.getTime(), book.createdAt.getTime()),
          now
        )
      ),
    }));
  });
}

const LIST_TITLES = [
  'Rainy-day reads',
  'Next on my shelf',
  'Worlds worth getting lost in',
  'Comfort re-reads',
  'Slow burns',
  'Weekend binge',
  'Found by accident',
  'Recommended to everyone',
] as const;

const LIST_DESCRIPTIONS = [
  'Things I keep coming back to.',
  'A pile I mean to get through this season.',
  'Picked for mood rather than genre.',
  'Short on time? Start here.',
] as const;

const LIST_TAGS = [
  'cozy',
  'epic',
  'slow-burn',
  'favorites',
  'to-read',
] as const;

// Readers only: each curates 1-2 lists of 3-6 shown works, one or two of them
// Series so most lists mix both kinds.
function planReadingLists(
  rng: Rng,
  authors: readonly PlannedAuthor[],
  accounts: Plan['accounts']
): PlannedReadingList[] {
  const { books, series, now, heldSince } = shownWorks(rng, authors);

  return accounts.flatMap((account, accountIndex) => {
    if (account.spec.role !== 'user') return [];

    return rng
      .sample(LIST_TITLES, rng.int(1, 2))
      .map((title): PlannedReadingList => {
        const size = rng.int(3, 6);
        const seriesCount = Math.min(rng.int(1, 2), series.length);
        const items = [
          ...rng.sample(series, seriesCount).map((entry) => ({
            book: null,
            series: entry,
          })),
          ...rng.sample(books, size - seriesCount).map((book) => ({
            book,
            series: null,
          })),
        ];
        const newest = Math.max(
          ...items.map((item) => (item.book ?? item.series).createdAt.getTime())
        );
        const createdAt = heldSince(account.createdAt, new Date(newest));
        return {
          accountIndex,
          title,
          description: itemAt(
            LIST_DESCRIPTIONS,
            rng.int(0, LIST_DESCRIPTIONS.length - 1),
            'list description'
          ),
          tags: rng.sample(LIST_TAGS, rng.int(0, 3)),
          items: rng.shuffle(items),
          createdAt,
          updatedAt: new Date(rng.float(createdAt.getTime(), now)),
        };
      });
  });
}

const REPORT_EXPLANATIONS = [
  'Posts the same link under every book.',
  'Not spam or spoilers, but it reads as aimed at the author.',
  'Looks like an advert for another site.',
] as const;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// One reader gets exactly BAN_MARK_THRESHOLD Upheld Comments, so the Reports
// page has an Account at the ban mark; around it sits one Report of each
// status, a System report on a Comment that was dismissed before an edit, and
// an Upheld one on another Account. Plans no Comment and no Tombstone of its
// own: a Tombstone is only ever on a Comment with a reply.
function planReports(
  rng: Rng,
  comments: readonly PlannedComment[],
  tombstones: ReadonlyMap<PlannedComment, Tombstone>,
  accounts: Plan['accounts']
): PlannedReport[] {
  const now = Date.now();
  const moderatorIndex = accounts.findIndex(
    (account) => account.spec.login === 'admin'
  );
  if (moderatorIndex === -1) {
    throw new Error('Seed plan has no admin account to moderate Reports');
  }
  const roleOf = (index: number) =>
    itemAt(accounts, index, 'account').spec.role;
  const isStaff = (index: number) =>
    roleOf(index) === 'admin' || roleOf(index) === 'superadmin';
  const isLive = (comment: PlannedComment) =>
    tombstones.get(comment) === undefined;

  const reporterFor = (comment: PlannedComment): number =>
    rng.pick(
      accounts.flatMap((account, index) =>
        index !== comment.accountIndex &&
        index !== moderatorIndex &&
        account.createdAt <= comment.createdAt
          ? [index]
          : []
      )
    );
  // An hour after the Comment at the earliest, and early enough that the
  // stamps that follow it still lie in the past.
  const filedAt = (comment: PlannedComment): Date =>
    new Date(
      Math.min(
        comment.createdAt.getTime() + HOUR_MS + rng.float(0, 24 * HOUR_MS),
        now - 3 * HOUR_MS
      )
    );
  const explanationFor = (reason: ReportReason): string | null =>
    reason === 'other' ? rng.pick(REPORT_EXPLANATIONS) : null;

  const report = (
    comment: PlannedComment,
    fields: Pick<PlannedReport, 'status' | 'reason' | 'createdAt'> &
      Partial<PlannedReport>
  ): PlannedReport => ({
    comment,
    reporterIndex: reporterFor(comment),
    explanation: explanationFor(fields.reason),
    moderatorIndex: null,
    settledText: null,
    takenAt: null,
    settledAt: null,
    ...fields,
  });
  const settledBy = (createdAt: Date) => ({
    moderatorIndex,
    takenAt: new Date(createdAt.getTime() + 30 * MINUTE_MS),
    settledAt: new Date(createdAt.getTime() + 2 * HOUR_MS),
  });

  let offender = -1;
  let offenderPool: PlannedComment[] = [];
  accounts.forEach((_, index) => {
    if (roleOf(index) !== 'user') return;
    const owned = comments.filter(
      (comment) =>
        comment.accountIndex === index && tombstones.get(comment) !== 'deleted'
    );
    if (owned.length > offenderPool.length) {
      offender = index;
      offenderPool = owned;
    }
  });
  if (offenderPool.length < BAN_MARK_THRESHOLD) {
    throw new Error(
      `Seed plan: the busiest reader holds ${String(offenderPool.length)} Comments, ${String(BAN_MARK_THRESHOLD)} needed for the ban mark`
    );
  }

  const reports = rng
    .sample(offenderPool, BAN_MARK_THRESHOLD)
    .map((comment, position) => {
      const createdAt = filedAt(comment);
      return report(comment, {
        status: 'upheld',
        reason: itemAt(
          REPORT_REASONS,
          position % REPORT_REASONS.length,
          'report reason'
        ),
        createdAt,
        ...settledBy(createdAt),
      });
    });

  const shown = comments.filter(
    (comment) =>
      !isStaff(comment.accountIndex) &&
      comment.accountIndex !== offender &&
      tombstones.get(comment) !== 'deleted'
  );
  const live = rng.sample(shown.filter(isLive), 4);
  const fresh = itemAt(live, 0, 'live Comment');
  const taken = itemAt(live, 1, 'live Comment');
  const dismissed = itemAt(live, 2, 'live Comment');
  const edited = itemAt(live, 3, 'live Comment');

  const freshAt = new Date(now - 10 * MINUTE_MS);
  reports.push(
    report(fresh, { status: 'new', reason: 'other', createdAt: freshAt })
  );

  const takenAt = new Date(now - 95 * MINUTE_MS);
  reports.push(
    report(taken, {
      status: 'in_review',
      reason: 'harassment',
      createdAt: takenAt,
      moderatorIndex,
      takenAt: new Date(takenAt.getTime() + 30 * MINUTE_MS),
    })
  );

  const dismissedAt = filedAt(dismissed);
  reports.push(
    report(dismissed, {
      status: 'dismissed',
      reason: 'spoilers',
      createdAt: dismissedAt,
      settledText: dismissed.text,
      ...settledBy(dismissedAt),
    })
  );

  // Dismissed, then edited past the reopen distance: the System files a new
  // Report on the new text, and the dismissal keeps the text it judged.
  const editedAt = filedAt(edited);
  const editedReason = 'spam';
  reports.push(
    report(edited, {
      status: 'dismissed',
      reason: editedReason,
      createdAt: editedAt,
      settledText: itemAt(
        TOP_LEVEL_COMMENTS.filter((text) => text !== edited.text),
        0,
        'earlier text'
      ),
      ...settledBy(editedAt),
    }),
    report(edited, {
      status: 'new',
      reason: editedReason,
      reporterIndex: null,
      createdAt: new Date(now - 20 * MINUTE_MS),
    })
  );

  // One more Account with an Upheld Comment, below the ban mark. A Comment a
  // Moderator already removed is preferred: that is what an Uphold leaves.
  const rest = shown.filter(
    (comment) => !reports.some((r) => r.comment === comment)
  );
  const removed = rest.filter(
    (comment) => tombstones.get(comment) === 'removed'
  );
  const upheld = rng.pick(removed.length > 0 ? removed : rest);
  const upheldAt = filedAt(upheld);
  reports.push(
    report(upheld, {
      status: 'upheld',
      reason: 'harassment',
      createdAt: upheldAt,
      ...settledBy(upheldAt),
    })
  );

  return reports;
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
  // lastSeenAt draws nothing from rng, and is clamped so no account is last
  // seen before it existed.
  const withLastSeen = (spec: AccountSpec, createdAt: Date) => ({
    spec,
    createdAt,
    lastSeenAt:
      spec.lastSeenAgoMs === null
        ? null
        : new Date(
            Math.max(Date.now() - spec.lastSeenAgoMs, createdAt.getTime())
          ),
  });
  const accounts: Plan['accounts'] = [
    ...STAFF.map((spec) =>
      withLastSeen(spec, new Date(earliest - rng.int(30, 90) * DAY_MS))
    ),
    ...authors.map((author) => withLastSeen(author.spec, author.createdAt)),
    ...READERS.map((spec) =>
      withLastSeen(
        spec,
        new Date(rng.float(earliest, Date.now() - 30 * DAY_MS))
      )
    ),
  ];

  const threads = planThreads(
    rng,
    authors.flatMap((author) => author.books),
    accounts
  );
  // The draws below run in this order and only ever append: a new plan step
  // draws last, so every earlier draw (and the demo's chapters, comments and
  // likes) stays as it was.
  const favorites = planFavorites(rng, authors, accounts);
  const library = planLibrary(rng, authors, accounts);
  const readingLists = planReadingLists(rng, authors, accounts);
  const reports = planReports(
    rng,
    threads.comments,
    threads.tombstones,
    accounts
  );

  return {
    accounts,
    authors,
    ...threads,
    favorites,
    library,
    readingLists,
    reports,
  };
}
