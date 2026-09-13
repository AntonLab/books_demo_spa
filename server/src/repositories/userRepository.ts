import {
  literal,
  Op,
  UniqueConstraintError,
  where as sequelizeWhere,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Comment } from '../models/Comment.ts';
import { Session } from '../models/Session.ts';
import { toPublicUser, User } from '../models/User.ts';
import { containsPattern } from './likePattern.ts';
import { ConflictError } from '../types/errors.ts';
import type {
  CreateUserInput,
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

export function createSequelizeUserRepository(): UserRepository {
  return {
    async create(input, role = 'user') {
      try {
        const user = await User.create({ ...input, role });
        return toPublicUser(user);
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

      return { items: rows.map(toPublicUser), total: count };
    },

    async findById(id) {
      const user = await User.findByPk(id);
      return user ? toPublicUser(user) : null;
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

        return toPublicUser(user);
      });
    },

    // The account's comments stay behind as `deleted` tombstones, so the
    // replies other people wrote under them keep their thread. They are marked
    // in the same transaction as the delete: the foreign key then nulls their
    // owner, and a comment with no owner must never be live. Comments on the
    // books this account was the last Co-author of are the exception — they go
    // with those books (ADR-0004).
    //
    // A book with other Co-authors stays: the account's credit cascades away
    // with the account and the rest keep the book (ADR-0005). The books are
    // locked before they are counted, the same lock bookRepository's
    // removeCoAuthor takes, so a co-author leaving at the same moment cannot
    // leave a book credited to nobody.
    async remove(id) {
      const sequelize = User.sequelize;
      if (!sequelize) {
        throw new Error('User model is not initialised');
      }

      return sequelize.transaction(async (transaction) => {
        const creditedBookIds = (
          await BookAuthor.findAll({
            where: { userId: id },
            attributes: ['bookId'],
            transaction,
          })
        ).map((credit) => credit.bookId);

        if (creditedBookIds.length > 0) {
          await Book.findAll({
            where: { id: creditedBookIds },
            attributes: ['id'],
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          const credits = await BookAuthor.findAll({
            where: { bookId: creditedBookIds },
            attributes: ['bookId'],
            transaction,
          });
          const soleBookIds = creditedBookIds.filter(
            (bookId) =>
              credits.filter((credit) => credit.bookId === bookId).length === 1
          );
          if (soleBookIds.length > 0) {
            await Book.destroy({ where: { id: soleBookIds }, transaction });
          }
        }

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
      return toPublicUser(user);
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
      return user ? toPublicUser(user) : null;
    },

    async findPasswordHashById(id) {
      const user = await User.unscoped().findByPk(id, {
        attributes: ['password'],
      });
      return user ? user.password : null;
    },
  };
}
