import {
  ForeignKeyConstraintError,
  UniqueConstraintError,
  type Sequelize,
  type Transaction,
} from 'sequelize';
import { toAuthorSummary, User } from '../models/User.ts';
import { loadAvatarUrls } from './userRepository.ts';
import {
  BadRequestError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { AuthorSummary } from '../types/user.ts';
import { displayNameOf, notify, type Actor } from './notificationRepository.ts';

// The Co-author rules (ADR-0005), written once for Books and Series. Credits
// live in two tables, each with a real foreign key (sequelize.md), so each
// repository hands these functions an adapter over its own table.

export interface Credit {
  workId: number;
  userId: number;
  user?: User;
}

export interface CreditTable {
  type: 'book' | 'series';
  // In credit order: by surrogate id, since two credits can share a second.
  find(
    workIds: number[],
    options: { withUser?: boolean; transaction?: Transaction }
  ): Promise<Credit[]>;
  create(
    workId: number,
    userId: number,
    transaction: Transaction
  ): Promise<unknown>;
  destroy(
    workId: number,
    userId: number,
    transaction: Transaction
  ): Promise<unknown>;
}

interface Work {
  id: number;
  title: string;
}

// A rejected FK while creating a work means its first credit names an account
// that is gone. Reporting that as a 404 on the user is more useful than the
// generic 500 an unmapped SequelizeForeignKeyConstraintError would produce.
//
// The credit's userId is the only foreign key this maps. A work's genreId
// cannot fail: assertGenreExists (genreRepository.ts) holds the Genre under a
// share lock for the rest of the transaction. Nor can a book's seriesId:
// nextSeriesPosition holds a new series under a lock and answers a missing
// one itself, and a kept series is pinned by the locked book row.
export function asMissingUser(error: unknown, userId: number): never {
  if (error instanceof ForeignKeyConstraintError) {
    throw new NotFoundError('User', userId);
  }
  throw error;
}

export async function creditedIds(
  table: CreditTable,
  workId: number,
  transaction?: Transaction
): Promise<number[]> {
  const credits = await table.find([workId], { transaction });
  return credits.map((credit) => credit.userId);
}

// Every Co-author of every work named, in credit order, in one query rather
// than an include, so a page's LIMIT stays over works. A work with no credits
// comes back with an empty list, so a caller can index the map without a
// fallback.
export async function loadAuthors(
  table: CreditTable,
  workIds: number[],
  transaction?: Transaction
): Promise<Map<number, AuthorSummary[]>> {
  const authors = new Map<number, AuthorSummary[]>(
    workIds.map((id) => [id, []])
  );
  if (workIds.length === 0) return authors;

  const credits = await table.find(workIds, { withUser: true, transaction });
  const avatarUrls = await loadAvatarUrls(
    credits.flatMap((credit) => (credit.user ? [credit.user.id] : [])),
    transaction
  );
  for (const { workId, user } of credits) {
    if (user) {
      authors
        .get(workId)
        ?.push(toAuthorSummary(user, avatarUrls.get(user.id) ?? null));
    }
  }
  return authors;
}

export async function addCoAuthor(
  table: CreditTable,
  sequelize: Sequelize,
  work: Work,
  userId: number,
  actor: Actor
): Promise<void> {
  const user = await User.findByPk(userId, { attributes: ['role'] });
  if (!user) throw new NotFoundError('User', userId);
  if (user.role !== 'author') {
    throw new BadRequestError(
      'Only an account holding the author role can be a co-author'
    );
  }

  try {
    await sequelize.transaction(async (transaction) => {
      await table.create(work.id, userId, transaction);
      await notify(
        [
          {
            recipientIds: [userId],
            kind: 'co_author_added',
            work: { type: table.type, id: work.id, title: work.title },
            actorKind: 'co_author',
            actorName: await displayNameOf(actor.id, transaction),
          },
        ],
        actor.id,
        transaction
      );
    });
  } catch (error) {
    // The unique index, not a lookup, is what refuses a second credit.
    if (error instanceof UniqueConstraintError) {
      throw new StateConflictError(
        `That account is already a co-author of this ${table.type}`
      );
    }
    throw error;
  }
}

// Covers both removing someone else and leaving: the actor naming the account
// removed is what makes it a leave. The caller must hold the work row under
// FOR UPDATE in `transaction`: without it, two Co-authors of a two-author
// work leaving at once would each count two, each delete, and leave the work
// credited to nobody. userRepository.remove takes the same lock.
export async function removeCoAuthor(
  table: CreditTable,
  work: Work,
  userId: number,
  actor: Actor,
  transaction: Transaction
): Promise<void> {
  const coAuthorIds = await creditedIds(table, work.id, transaction);
  // Not credited comes first: on a solo work a stranger would otherwise be
  // told the work's real co-author cannot leave.
  if (!coAuthorIds.includes(userId)) {
    throw new NotFoundError('Co-author', userId);
  }
  if (coAuthorIds.length <= 1) {
    throw new StateConflictError(
      `The last co-author cannot leave; delete the ${table.type} instead`
    );
  }

  await table.destroy(work.id, userId, transaction);
  // A Co-author leaving tells the ones who remain; one removed by another is
  // told themselves.
  const leaving = userId === actor.id;
  await notify(
    [
      {
        recipientIds: leaving ? coAuthorIds : [userId],
        kind: leaving ? 'co_author_left' : 'co_author_removed',
        work: { type: table.type, id: work.id, title: work.title },
        actorKind: 'co_author',
        actorName: await displayNameOf(actor.id, transaction),
      },
    ],
    actor.id,
    transaction
  );
}
