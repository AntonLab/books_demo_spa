import {
  literal,
  Op,
  UniqueConstraintError,
  where as sequelizeWhere,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { toPublicUser, User } from '../models/User.ts';
import { containsPattern } from './likePattern.ts';
import { ConflictError } from '../types/errors.ts';
import type {
  CreateUserInput,
  ListUsersQuery,
  PublicUser,
  UpdateUserInput,
} from '../types/user.ts';

export interface UserListResult {
  items: PublicUser[];
  total: number;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<PublicUser>;
  list(query: ListUsersQuery): Promise<UserListResult>;
  findById(id: number): Promise<PublicUser | null>;
  update(id: number, input: UpdateUserInput): Promise<PublicUser | null>;
  remove(id: number): Promise<boolean>;
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
    async create(input) {
      try {
        const user = await User.create(input);
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

    async update(id, input) {
      // unscoped so the instance carries the password, letting the beforeSave
      // hook see a real change when the caller supplies a new one.
      const user = await User.unscoped().findByPk(id);
      if (!user) return null;

      try {
        await user.update(input);
      } catch (error) {
        asConflict(error);
      }

      return toPublicUser(user);
    },

    async remove(id) {
      const deleted = await User.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}
