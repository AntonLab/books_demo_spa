import { Op, type CreationAttributes, type Transaction } from 'sequelize';
import type { PublicNotification } from 'shared';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Chapter } from '../models/Chapter.ts';
import { Favorite } from '../models/Favorite.ts';
import { Notification, toPublicNotification } from '../models/Notification.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';

export interface AnnouncedChapter {
  bookId: number;
  bookTitle: string;
  chapterId: number;
  chapterTitle: string;
}

export interface AnnouncedBook {
  bookId: number;
  bookTitle: string;
  seriesId: number;
  seriesTitle: string;
}

// Everything one Account is told by one pass. `notifications` are the rows
// written or grown, as they now stand, for the stream; `chapters` and `books`
// are only what is new in this pass, for the email. `email` is null when the
// Account is not to be mailed: its switch is off, or it is Blocked.
export interface RecipientNews {
  userId: number;
  email: string | null;
  notifications: PublicNotification[];
  chapters: AnnouncedChapter[];
  books: AnnouncedBook[];
}

export interface AnnouncementRepository {
  // Claims everything due at `now` and writes its Notifications in one
  // transaction; answers after commit, ordered by account id.
  announce(now: Date): Promise<RecipientNews[]>;
}

interface Gathered {
  notificationIds: Set<number>;
  chapters: AnnouncedChapter[];
  books: AnnouncedBook[];
}

type Gathering = Map<number, Gathered>;

function gatheredFor(gathering: Gathering, userId: number): Gathered {
  let gathered = gathering.get(userId);
  if (!gathered) {
    gathered = { notificationIds: new Set(), chapters: [], books: [] };
    gathering.set(userId, gathered);
  }
  return gathered;
}

function sequelizeOf(): NonNullable<typeof Notification.sequelize> {
  const sequelize = Notification.sequelize;
  if (!sequelize) throw new Error('Notification model is not initialised');
  return sequelize;
}

// Each Book's Co-authors, who are never told about their own work.
async function coAuthorsOf(
  bookIds: number[],
  transaction: Transaction
): Promise<Map<number, Set<number>>> {
  const credits = await BookAuthor.findAll({
    attributes: ['bookId', 'userId'],
    where: { bookId: bookIds },
    transaction,
  });
  const byBook = new Map<number, Set<number>>();
  for (const credit of credits) {
    const ids = byBook.get(credit.bookId) ?? new Set<number>();
    ids.add(credit.userId);
    byBook.set(credit.bookId, ids);
  }
  return byBook;
}

// A Chapter out while its Book is a Draft has no reader to tell. Marking it
// now is what keeps a Draft's backlog from being announced as New chapters
// the day the Book turns Published: its New book says it instead.
async function silenceDraftBacklog(
  now: Date,
  transaction: Transaction
): Promise<void> {
  const backlog = await Chapter.findAll({
    attributes: ['id'],
    where: { announcedAt: null, publishedAt: { [Op.lte]: now } },
    include: [
      {
        model: Book,
        as: 'book',
        attributes: [],
        required: true,
        where: { status: 'draft' },
      },
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (backlog.length === 0) return;

  await Chapter.update(
    { announcedAt: now },
    {
      where: { id: backlog.map((row) => row.id), announcedAt: null },
      silent: true,
      transaction,
    }
  );
}

// Published Books whose Release time has passed (CONTEXT.md) and that were
// never announced: each is a New book to its Series' Favorite holders.
async function releaseBooks(
  now: Date,
  gathering: Gathering,
  transaction: Transaction
): Promise<void> {
  const released = await Book.findAll({
    attributes: ['id', 'title', 'seriesId'],
    where: { announcedAt: null, status: { [Op.ne]: 'draft' } },
    include: [
      {
        model: Chapter,
        as: 'chapters',
        attributes: [],
        required: true,
        where: { publishedAt: { [Op.lte]: now } },
      },
    ],
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (released.length === 0) return;

  const bookIds = released.map((book) => book.id);
  await Book.update(
    { announcedAt: now },
    { where: { id: bookIds, announcedAt: null }, silent: true, transaction }
  );

  const seriesIds = [
    ...new Set(
      released.flatMap((book) =>
        book.seriesId === null ? [] : [book.seriesId]
      )
    ),
  ];
  if (seriesIds.length === 0) return;

  const seriesTitles = new Map(
    (
      await Series.findAll({
        attributes: ['id', 'title'],
        where: { id: seriesIds },
        transaction,
      })
    ).map((row) => [row.id, row.title])
  );
  const holders = await Favorite.findAll({
    attributes: ['userId', 'seriesId'],
    where: { seriesId: seriesIds },
    transaction,
  });
  const coAuthors = await coAuthorsOf(bookIds, transaction);

  const rows: CreationAttributes<Notification>[] = [];
  for (const book of released) {
    if (book.seriesId === null) continue;
    const announced: AnnouncedBook = {
      bookId: book.id,
      bookTitle: book.title,
      seriesId: book.seriesId,
      seriesTitle: seriesTitles.get(book.seriesId) ?? '',
    };
    for (const holder of holders) {
      if (Number(holder.seriesId) !== Number(book.seriesId)) continue;
      if (coAuthors.get(book.id)?.has(holder.userId)) continue;
      gatheredFor(gathering, holder.userId).books.push(announced);
      rows.push({
        userId: holder.userId,
        kind: 'new_book',
        workType: 'book',
        bookId: announced.bookId,
        workTitle: announced.bookTitle,
        seriesId: announced.seriesId,
        seriesTitle: announced.seriesTitle,
      });
    }
  }

  const created = await Notification.bulkCreate(rows, { transaction });
  for (const row of created) {
    gatheredFor(gathering, row.userId).notificationIds.add(row.id);
  }
}

// Chapters of announced, Published Books whose Publication time has passed:
// each a New chapter to the Book's Favorite holders.
async function announceChapters(
  now: Date,
  gathering: Gathering,
  transaction: Transaction
): Promise<void> {
  const due = await Chapter.findAll({
    attributes: ['id', 'bookId', 'title'],
    where: { announcedAt: null, publishedAt: { [Op.lte]: now } },
    include: [
      {
        model: Book,
        as: 'book',
        attributes: ['id', 'title'],
        required: true,
        where: {
          status: { [Op.ne]: 'draft' },
          announcedAt: { [Op.ne]: null },
        },
      },
    ],
    order: [
      ['bookId', 'ASC'],
      ['position', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (due.length === 0) return;

  // silent: chapters.updatedAt is the version a Co-author's save is checked
  // against; announcing must not turn their next save into a 409.
  await Chapter.update(
    { announcedAt: now },
    {
      where: { id: due.map((row) => row.id), announcedAt: null },
      silent: true,
      transaction,
    }
  );

  const chaptersByBook = new Map<number, AnnouncedChapter[]>();
  for (const row of due) {
    const chapters = chaptersByBook.get(row.bookId) ?? [];
    chapters.push({
      bookId: row.bookId,
      bookTitle: row.book?.title ?? '',
      chapterId: row.id,
      chapterTitle: row.title,
    });
    chaptersByBook.set(row.bookId, chapters);
  }
  const bookIds = [...chaptersByBook.keys()];

  const holders = await Favorite.findAll({
    attributes: ['userId', 'bookId'],
    where: { bookId: bookIds },
    transaction,
  });
  const coAuthors = await coAuthorsOf(bookIds, transaction);
  const recipientsByBook = new Map<number, number[]>();
  for (const holder of holders) {
    const { bookId } = holder;
    if (bookId === null || coAuthors.get(bookId)?.has(holder.userId)) continue;
    const recipients = recipientsByBook.get(bookId) ?? [];
    recipients.push(holder.userId);
    recipientsByBook.set(bookId, recipients);
  }
  if (recipientsByBook.size === 0) return;

  // Locked, so marking read waits for this pass and then marks the grown row.
  const unread = await Notification.findAll({
    attributes: ['id', 'userId', 'bookId'],
    where: {
      kind: 'new_chapter',
      readAt: null,
      bookId: [...recipientsByBook.keys()],
      userId: [...new Set([...recipientsByBook.values()].flat())],
    },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const unreadIds = new Map<string, number>();
  for (const row of unread) {
    const key = `${row.userId}:${row.bookId}`;
    if (!unreadIds.has(key)) unreadIds.set(key, row.id);
  }

  const rows: CreationAttributes<Notification>[] = [];
  // notificationId -> how much to grow it by. Filled inside the loop below,
  // applied after it: one increment per distinct amount, not one per Book.
  const growthByNotificationId = new Map<number, number>();
  for (const [bookId, recipientIds] of recipientsByBook) {
    const chapters = chaptersByBook.get(bookId) ?? [];
    const [first] = chapters;
    if (!first) continue;

    for (const userId of recipientIds) {
      const gathered = gatheredFor(gathering, userId);
      gathered.chapters.push(...chapters);
      const unreadId = unreadIds.get(`${userId}:${bookId}`);
      if (unreadId === undefined) {
        rows.push({
          userId,
          kind: 'new_chapter',
          workType: 'book',
          bookId,
          workTitle: first.bookTitle,
          chapterId: first.chapterId,
          chapterTitle: first.chapterTitle,
          chapterCount: chapters.length,
        });
      } else {
        // The target stays the first unread new Chapter; only the count grows.
        gathered.notificationIds.add(unreadId);
        growthByNotificationId.set(unreadId, chapters.length);
      }
    }
  }

  const idsByAmount = new Map<number, number[]>();
  for (const [notificationId, amount] of growthByNotificationId) {
    const ids = idsByAmount.get(amount) ?? [];
    ids.push(notificationId);
    idsByAmount.set(amount, ids);
  }
  for (const [amount, ids] of idsByAmount) {
    await Notification.increment(
      { chapterCount: amount },
      { where: { id: ids }, transaction }
    );
  }

  const created = await Notification.bulkCreate(rows, { transaction });
  for (const row of created) {
    gatheredFor(gathering, row.userId).notificationIds.add(row.id);
  }
}

// Read after commit, so what the caller then pushes or mails describes rows
// that are announced for good.
async function newsOf(gathering: Gathering): Promise<RecipientNews[]> {
  if (gathering.size === 0) return [];

  const userIds = [...gathering.keys()];
  const notificationIds = [...gathering.values()].flatMap((gathered) => [
    ...gathered.notificationIds,
  ]);
  const rows = await Notification.findAll({
    where: { id: notificationIds },
    order: [['id', 'ASC']],
  });
  const accounts = new Map(
    (
      await User.findAll({
        attributes: ['id', 'email', 'status', 'emailNotifications'],
        where: { id: userIds },
      })
    ).map((account) => [account.id, account])
  );

  return [...gathering]
    .sort(([left], [right]) => left - right)
    .map(([userId, gathered]) => {
      const account = accounts.get(userId);
      const mailable =
        account !== undefined &&
        account.emailNotifications &&
        account.status !== 'blocked';
      return {
        userId,
        email: mailable ? account.email : null,
        notifications: rows
          .filter((row) => gathered.notificationIds.has(row.id))
          .map(toPublicNotification),
        chapters: gathered.chapters,
        books: gathered.books,
      };
    });
}

export function createSequelizeAnnouncementRepository(): AnnouncementRepository {
  return {
    async announce(now) {
      const gathering: Gathering = new Map();
      await sequelizeOf().transaction(async (transaction) => {
        await silenceDraftBacklog(now, transaction);
        await releaseBooks(now, gathering, transaction);
        await announceChapters(now, gathering, transaction);
      });
      return newsOf(gathering);
    },
  };
}
