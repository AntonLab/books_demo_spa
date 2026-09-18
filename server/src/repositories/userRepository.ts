import {
  literal,
  Op,
  UniqueConstraintError,
  where as sequelizeWhere,
} from 'sequelize';
import type { Transaction, WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Comment } from '../models/Comment.ts';
import { Series } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { Session } from '../models/Session.ts';
import { toAuthorSummary, toPublicUser, User } from '../models/User.ts';
import { UserAvatar } from '../models/UserAvatar.ts';
import { containsPattern } from './likePattern.ts';
import { notify } from './notificationRepository.ts';
import { ConflictError } from '../types/errors.ts';
import type {
  AuthorSummary,
  CreateUserInput,
  ListAuthorsQuery,
  ListUsersQuery,
  PublicUser,
  UserChanges,
  UserStatus,
} from '../types/user.ts';
import type { UserRole } from '../types/permission.ts';

export interface UserListResult {
  items: PublicUser[];
  total: number;
}

export interface UserRepository {
  // The role is a separate argument rather than part of CreateUserInput, so
  // the type itself says it is not caller-supplied body data — the same shape
  // as `actorId` on the comment and like repositories.
  create(input: CreateUserInput, role?: UserRole): Promise<PublicUser>;
  list(query: ListUsersQuery): Promise<UserListResult>;
  // The accounts that can be made a Co-author — Role `author`, not blocked —
  // as AuthorSummary, so the picker that searches them never sees an email.
  listAuthors(query: ListAuthorsQuery): Promise<AuthorSummary[]>;
  findById(id: number): Promise<PublicUser | null>;
  update(id: number, input: UserChanges): Promise<PublicUser | null>;
  remove(id: number): Promise<boolean>;
  // The one door role changes travel through — see userRoleRoutes.ts. Its own
  // method rather than a field on update(), so a role can never ride in
  // alongside an ordinary field edit.
  updateRole(id: number, role: UserRole): Promise<PublicUser | null>;
  findByLoginWithPassword(
    login: string
  ): Promise<{ id: number; password: string; status: UserStatus } | null>;
  findByEmail(email: string): Promise<PublicUser | null>;
  // The stored hash for one account, for the controller to check a
  // currentPassword against. As narrow as findByLoginWithPassword, for the
  // same reason: the hash must not travel further than the check.
  findPasswordHashById(id: number): Promise<string | null>;
  // The Avatar's bytes never ride along with any other read (S2). null/false
  // mean "no such account or no such picture" — always public, so unlike a
  // book's Cover this takes no Viewer.
  setAvatar(id: number, data: Buffer): Promise<boolean>;
  removeAvatar(id: number): Promise<void>;
  getAvatarData(id: number): Promise<{ data: Buffer; updatedAt: Date } | null>;
}

// MySQL reports the violated index, not the column, and the shape varies by
// driver version — so every available hint is searched for a known field name.
function conflictFieldOf(error: UniqueConstraintError): 'login' | 'email' {
  const hints = [
    ...(error.errors ?? []).map((item) => item.path ?? ''),
    ...Object.keys(error.fields ?? {}),
    error.message,
  ];

  return hints.join(' ').toLowerCase().includes('email') ? 'email' : 'login';
}

function asConflict(error: unknown): never {
  if (error instanceof UniqueConstraintError) {
    throw new ConflictError(conflictFieldOf(error));
  }
  throw error;
}

// The URL every embedded AuthorSummary or PublicUser resolves an Avatar to
// (A7), versioned by the picture's own updatedAt so a replace is never
// served stale under the immutable cache header. Exported for
// bookRepository, seriesRepository and commentRepository, which each embed
// AuthorSummary the same batched way loadAuthors already does.
export async function loadAvatarUrls(
  userIds: number[],
  transaction?: Transaction
): Promise<Map<number, string>> {
  if (userIds.length === 0) return new Map();

  const avatars = await UserAvatar.findAll({
    where: { userId: userIds },
    attributes: ['userId', 'updatedAt'],
    transaction,
  });
  return new Map(
    avatars.map((avatar) => [
      avatar.userId,
      `/api/users/${avatar.userId}/avatar?v=${avatar.updatedAt.getTime()}`,
    ])
  );
}

function buildWhere(query: ListUsersQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.status) {
    clauses.push({ status: query.status });
  }

  if (query.q) {
    const pattern = containsPattern(query.q);
    clauses.push({
      [Op.or]: [
        // `login` carries a case-sensitive collation, so a plain LIKE there
        // would stop "bob" from finding "Bob". Identity is strict; search is not.
        sequelizeWhere(literal('`login` COLLATE utf8mb4_0900_ai_ci'), {
          [Op.like]: pattern,
        }),
        { email: { [Op.like]: pattern } },
        { firstName: { [Op.like]: pattern } },
        { lastName: { [Op.like]: pattern } },
      ],
    });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

interface CreditedWorks {
  // Every work the account is credited on, with the title it has now.
  works: { id: number; title: string }[];
  // One entry per credit on those works, every Co-author included.
  credits: { workId: number; userId: number }[];
}

// Reads the works an account is credited on, locks them, and only then reads
// their credits, so they cannot change underneath the caller. The reads are
// passed in because books and series keep their credits in two tables.
async function lockCreditedWorks(
  userId: number,
  lock: (workIds: number[]) => Promise<{ id: number; title: string }[]>,
  creditedWorkIds: (userId: number) => Promise<number[]>,
  creditsOn: (
    workIds: number[]
  ) => Promise<{ workId: number; userId: number }[]>
): Promise<CreditedWorks> {
  const workIds = await creditedWorkIds(userId);
  if (workIds.length === 0) return { works: [], credits: [] };

  const works = await lock(workIds);
  return { works, credits: await creditsOn(workIds) };
}

// The works whose only credit is the account's own.
function soleCredits({ works, credits }: CreditedWorks): number[] {
  return works
    .map((work) => work.id)
    .filter(
      (workId) =>
        credits.filter((credit) => credit.workId === workId).length === 1
    );
}

// The works the account shares, each with the Co-authors who stay on it —
// the ones told the account is gone.
function sharedCredits(
  { works, credits }: CreditedWorks,
  userId: number
): { id: number; title: string; others: number[] }[] {
  return works.flatMap((work) => {
    const others = credits
      .filter((credit) => credit.workId === work.id && credit.userId !== userId)
      .map((credit) => credit.userId);
    // Copied field by field: the works are model instances, whose attributes
    // are getters a spread would not carry.
    return others.length > 0
      ? [{ id: work.id, title: work.title, others }]
      : [];
  });
}

export function createSequelizeUserRepository(): UserRepository {
  return {
    async create(input, role = 'user') {
      try {
        const user = await User.create({ ...input, role });
        // A brand-new account cannot have an Avatar yet.
        return toPublicUser(user, null);
      } catch (error) {
        asConflict(error);
      }
    },

    async list(query) {
      const { rows, count } = await User.findAndCountAll({
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });
      const avatarUrls = await loadAvatarUrls(rows.map((row) => row.id));

      return {
        items: rows.map((row) =>
          toPublicUser(row, avatarUrls.get(row.id) ?? null)
        ),
        total: count,
      };
    },

    async listAuthors(query) {
      const clauses: WhereOptions[] = [
        { role: 'author' },
        { status: { [Op.ne]: 'blocked' } },
      ];
      if (query.q) {
        const pattern = containsPattern(query.q);
        clauses.push({
          [Op.or]: [
            // The same case-insensitive override the directory search uses:
            // `login` carries a case-sensitive collation.
            sequelizeWhere(literal('`login` COLLATE utf8mb4_0900_ai_ci'), {
              [Op.like]: pattern,
            }),
            { firstName: { [Op.like]: pattern } },
            { lastName: { [Op.like]: pattern } },
          ],
        });
      }

      const authors = await User.findAll({
        where: { [Op.and]: clauses },
        attributes: ['id', 'login', 'firstName', 'lastName'],
        limit: query.limit,
        order: [['id', 'ASC']],
      });
      const avatarUrls = await loadAvatarUrls(
        authors.map((author) => author.id)
      );
      return authors.map((author) =>
        toAuthorSummary(author, avatarUrls.get(author.id) ?? null)
      );
    },

    async findById(id) {
      const user = await User.findByPk(id);
      if (!user) return null;
      const avatarUrls = await loadAvatarUrls([id]);
      return toPublicUser(user, avatarUrls.get(id) ?? null);
    },

    // One transaction, so a block or a password change and the sessions it
    // ends land together: a partial apply would leave the old sessions alive
    // beside the new state, the exact thing this exists to prevent.
    async update(id, input) {
      const sequelize = User.sequelize;
      if (!sequelize) {
        throw new Error('User model is not initialised');
      }

      return sequelize.transaction(async (transaction) => {
        // unscoped so the instance carries the password, letting the
        // beforeSave hook see a real change when the caller supplies a new
        // one. FOR UPDATE so two concurrent updates cannot both read the
        // status as unblocked.
        const user = await User.unscoped().findByPk(id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!user) return null;

        const wasBlocked = user.status === 'blocked';
        try {
          await user.update(input, { transaction });
        } catch (error) {
          asConflict(error);
        }

        // Only the move into `blocked` ends sessions: re-blocking deletes
        // nothing, and unblocking hands nothing back.
        const becameBlocked = !wasBlocked && user.status === 'blocked';
        if (input.password !== undefined || becameBlocked) {
          await Session.destroy({ where: { userId: id }, transaction });
        }

        const avatarUrls = await loadAvatarUrls([id], transaction);
        return toPublicUser(user, avatarUrls.get(id) ?? null);
      });
    },

    // The account's comments stay behind as `deleted` tombstones, so the
    // replies other people wrote under them keep their thread. They are marked
    // in the same transaction as the delete: the foreign key then nulls their
    // owner, and a comment with no owner must never be live. Comments on the
    // books this account was the last Co-author of are the exception — they go
    // with those books (ADR-0004).
    //
    // A book or series with other Co-authors stays: the account's credit
    // cascades away with the account and the rest keep the work (ADR-0005).
    // One this account was the last Co-author of is deleted — a series only
    // unlinks its books, a book takes its chapters and comments with it. The
    // works are locked before they are counted, the same lock each
    // repository's removeCoAuthor takes, so a co-author leaving at the same
    // moment cannot leave a work credited to nobody.
    async remove(id) {
      const sequelize = User.sequelize;
      if (!sequelize) {
        throw new Error('User model is not initialised');
      }

      return sequelize.transaction(async (transaction) => {
        const creditedSeries = await lockCreditedWorks(
          id,
          (seriesIds) =>
            Series.findAll({
              where: { id: seriesIds },
              attributes: ['id', 'title'],
              lock: transaction.LOCK.UPDATE,
              transaction,
            }),
          async (userId) =>
            (
              await SeriesAuthor.findAll({
                where: { userId },
                attributes: ['seriesId'],
                transaction,
              })
            ).map((credit) => credit.seriesId),
          async (seriesIds) =>
            (
              await SeriesAuthor.findAll({
                where: { seriesId: seriesIds },
                attributes: ['seriesId', 'userId'],
                transaction,
              })
            ).map((credit) => ({
              workId: credit.seriesId,
              userId: credit.userId,
            }))
        );
        const soleSeriesIds = soleCredits(creditedSeries);
        if (soleSeriesIds.length > 0) {
          await Series.destroy({ where: { id: soleSeriesIds }, transaction });
        }

        const creditedBooks = await lockCreditedWorks(
          id,
          (bookIds) =>
            Book.findAll({
              where: { id: bookIds },
              attributes: ['id', 'title'],
              lock: transaction.LOCK.UPDATE,
              transaction,
            }),
          async (userId) =>
            (
              await BookAuthor.findAll({
                where: { userId },
                attributes: ['bookId'],
                transaction,
              })
            ).map((credit) => credit.bookId),
          async (bookIds) =>
            (
              await BookAuthor.findAll({
                where: { bookId: bookIds },
                attributes: ['bookId', 'userId'],
                transaction,
              })
            ).map((credit) => ({
              workId: credit.bookId,
              userId: credit.userId,
            }))
        );
        const soleBookIds = soleCredits(creditedBooks);
        if (soleBookIds.length > 0) {
          await Book.destroy({ where: { id: soleBookIds }, transaction });
        }

        // Every work the account shares keeps its other Co-authors, and each of
        // them is told — as by a deleted account, which has no name to give.
        // The works it alone was credited on went above and tell nobody.
        await notify(
          [
            ...sharedCredits(creditedSeries, id).map((series) => ({
              type: 'series' as const,
              ...series,
            })),
            ...sharedCredits(creditedBooks, id).map((book) => ({
              type: 'book' as const,
              ...book,
            })),
          ].map((work) => ({
            recipientIds: work.others,
            kind: 'co_author_account_deleted' as const,
            work: { type: work.type, id: work.id, title: work.title },
            actorKind: 'deleted_account' as const,
            actorName: null,
          })),
          id,
          transaction
        );

        // silent, or every tombstone this leaves shares one updatedAt — a
        // stamp linking them to each other and to the moment of the delete.
        await Comment.update(
          { tombstone: 'deleted' },
          { where: { userId: id }, transaction, silent: true }
        );
        const deleted = await User.destroy({ where: { id }, transaction });
        return deleted > 0;
      });
    },

    async updateRole(id, role) {
      const user = await User.findByPk(id);
      if (!user) return null;

      await user.update({ role });
      const avatarUrls = await loadAvatarUrls([id]);
      return toPublicUser(user, avatarUrls.get(id) ?? null);
    },

    // The one place the password column is read. unscoped() bypasses the
    // defaultScope that excludes it; the return type is deliberately narrow so
    // the hash cannot travel further than the caller that verifies it.
    async findByLoginWithPassword(login) {
      const user = await User.unscoped().findOne({ where: { login } });
      return user
        ? { id: user.id, password: user.password, status: user.status }
        : null;
    },

    // No unscoped(): the defaultScope keeps the hash out, which is what the
    // reset flow wants — it needs the id, not the credential.
    async findByEmail(email) {
      const user = await User.findOne({ where: { email } });
      if (!user) return null;
      const avatarUrls = await loadAvatarUrls([user.id]);
      return toPublicUser(user, avatarUrls.get(user.id) ?? null);
    },

    async findPasswordHashById(id) {
      const user = await User.unscoped().findByPk(id, {
        attributes: ['password'],
      });
      return user ? user.password : null;
    },

    async setAvatar(id, data) {
      const user = await User.findByPk(id, { attributes: ['id'] });
      if (!user) return false;
      await UserAvatar.upsert({ userId: id, data });
      return true;
    },

    async removeAvatar(id) {
      await UserAvatar.destroy({ where: { userId: id } });
    },

    async getAvatarData(id) {
      const avatar = await UserAvatar.findByPk(id, {
        attributes: ['data', 'updatedAt'],
      });
      return avatar ? { data: avatar.data, updatedAt: avatar.updatedAt } : null;
    },
  };
}
