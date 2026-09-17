import { hashPassword } from '../password.ts';
import { ConflictError } from '../types/errors.ts';
import type { ListAuthorsQuery, PublicUser } from '../types/user.ts';
import type { UserListResult, UserRepository } from './userRepository.ts';

// A row as the fake stores it: the public user plus the one thing PublicUser
// deliberately omits, the password hash.
export type FakeUserRow = PublicUser & { password: string };

export interface FakeUserRepositoryOptions {
  // Accounts already there, with their hashes.
  seed?: FakeUserRow[];
  // Records every query the Co-author picker's search was handed.
  authorQueries?: ListAuthorsQuery[];
}

// An in-memory UserRepository for the route specs — the users, auth and
// author-search routes alike — held to the real one by
// userRepository.contract.testkit.ts on the parts the controllers rely on.
//
// Passwords are hashed with the deliberately weak test parameters. The domain
// rules stay in the real repository and are covered against MySQL: a block or
// a password change ends no session here, deleting an account leaves its works
// and comments alone, and the searches match no text.
export function createFakeUserRepository(
  options: FakeUserRepositoryOptions = {}
): UserRepository {
  const { seed = [], authorQueries = [] } = options;
  const rows = new Map<number, FakeUserRow>(seed.map((row) => [row.id, row]));
  // userId -> its stored Avatar. Rule-free, like the book fake's covers map
  // (T3): it answers for whatever account exists in `rows`.
  const avatars = new Map<number, { data: Buffer; updatedAt: Date }>();
  let nextId = 1;

  // Mirrors loadAvatarUrls in the real repository (T3-safe: it reads the
  // fake's own avatars map, no visibility rule attached), so a route spec can
  // see avatarUrl change after a PUT/DELETE on /:id/avatar.
  const avatarUrlOf = (id: number): string | null => {
    const avatar = avatars.get(id);
    return avatar
      ? `/api/users/${id}/avatar?v=${avatar.updatedAt.getTime()}`
      : null;
  };

  // The public shape of a stored row. Strips the hash by name and nothing
  // else, so a key a caller should never have handed in still shows in the
  // answer — avatarUrl is computed from the avatars map rather than the
  // row's own field, which a create leaves null forever.
  const publicView = (row: FakeUserRow): PublicUser => {
    const { password: _password, ...user } = row;
    return { ...user, avatarUrl: avatarUrlOf(row.id) };
  };

  // Stands in for the unique indexes: login is case-sensitive, email is not,
  // as their collations make them in MySQL.
  const assertAvailable = (
    login: string,
    email: string,
    skipId?: number
  ): void => {
    for (const row of rows.values()) {
      if (row.id === skipId) continue;
      if (row.login === login) throw new ConflictError('login');
      if (row.email.toLowerCase() === email.toLowerCase()) {
        throw new ConflictError('email');
      }
    }
  };

  return {
    async create(input, role = 'user') {
      assertAvailable(input.login, input.email);
      while (rows.has(nextId)) nextId += 1;
      const now = new Date();
      const row: FakeUserRow = {
        id: nextId,
        login: input.login,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        status: input.status ?? 'pending',
        role,
        avatarUrl: null,
        password: await hashPassword(input.password, 'test'),
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return publicView(row);
    },

    async list(query): Promise<UserListResult> {
      const matching = [...rows.values()]
        .filter((row) => !query.status || row.status === query.status)
        .sort((a, b) => a.id - b.id);
      return {
        items: matching
          .slice(query.offset, query.offset + query.limit)
          .map(publicView),
        total: matching.length,
      };
    },

    async listAuthors(query) {
      authorQueries.push(query);
      return [...rows.values()]
        .filter((row) => row.role === 'author')
        .sort((a, b) => a.id - b.id)
        .slice(0, query.limit)
        .map(({ id, login, firstName, lastName }) => ({
          id,
          login,
          firstName,
          lastName,
          avatarUrl: avatarUrlOf(id),
        }));
    },

    async findById(id) {
      const row = rows.get(id);
      return row ? publicView(row) : null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      assertAvailable(
        input.login ?? current.login,
        input.email ?? current.email,
        id
      );
      // Applies every key it is handed rather than copying a named few. That
      // is what lets "a role in a PATCH body is ignored" fail: a fake that
      // never read `role` would pass it even if the schema let one through.
      const updated: FakeUserRow = {
        ...current,
        ...input,
        password:
          input.password === undefined
            ? current.password
            : await hashPassword(input.password, 'test'),
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return publicView(updated);
    },

    async remove(id) {
      return rows.delete(id);
    },

    async updateRole(id, role) {
      const current = rows.get(id);
      if (!current) return null;
      const updated: FakeUserRow = { ...current, role, updatedAt: new Date() };
      rows.set(id, updated);
      return publicView(updated);
    },

    async findByLoginWithPassword(login) {
      const row = [...rows.values()].find(
        (candidate) => candidate.login === login
      );
      return row
        ? { id: row.id, password: row.password, status: row.status }
        : null;
    },

    async findByEmail(email) {
      const row = [...rows.values()].find(
        (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
      );
      return row ? publicView(row) : null;
    },

    async findPasswordHashById(id) {
      return rows.get(id)?.password ?? null;
    },

    async setAvatar(id, data) {
      if (!rows.has(id)) return false;
      avatars.set(id, { data, updatedAt: new Date() });
      return true;
    },

    async removeAvatar(id) {
      avatars.delete(id);
    },

    async getAvatarData(id) {
      if (!rows.has(id)) return null;
      return avatars.get(id) ?? null;
    },
  };
}
