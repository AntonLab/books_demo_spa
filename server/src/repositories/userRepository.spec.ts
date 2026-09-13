process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import {
  Book,
  BookAuthor,
  Comment,
  initModels,
  Like,
  Series,
  Session,
  User,
} from '../models/index.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { verifyPassword } from '../password.ts';
import { ConflictError } from '../types/errors.ts';
import { hashToken } from '../tokens.ts';
import { createSequelizeUserRepository } from './userRepository.ts';

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: process.env.TEST_DB_NAME ?? 'books_demo_spa_test',
  });
  return config.db;
}

async function probe(): Promise<true | string> {
  if (!process.env.DB_USER)
    return 'DB_USER is not set — configure server/.env.local';
  try {
    const db = testDbConfig();
    const connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      connectTimeout: 4000,
    });
    await connection.end();
    return true;
  } catch (error) {
    return `MySQL unreachable: ${(error as Error).message}`;
  }
}

const reachable = await probe();
const skip = reachable === true ? false : reachable;

const base = {
  login: 'Bob',
  email: 'bob@example.com',
  password: 'hunter2hunter2',
  firstName: 'Bob',
  lastName: 'Bobsson',
};

describe('userRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeUserRepository();

  before(async () => {
    const db = testDbConfig();
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    // The whole model graph, not just User: series holds a foreign key into
    // users, and sync({ force: true }) can only drop users if it knows to drop
    // the referencing table first.
    initModels(sequelize);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  // Children first: deleting a user no longer cascades into their comments
  // (userId goes SET NULL instead), so those rows must be cleared explicitly
  // before the user that owned the book they live under.
  beforeEach(async () => {
    await Like.destroy({ where: {}, truncate: false });
    await Comment.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  test('stores a hash rather than the plaintext, and it verifies', async () => {
    const created = await repository.create({ ...base });

    const row = await User.unscoped().findByPk(created.id);
    assert.ok(row);
    assert.notEqual(row.password, base.password);
    assert.equal(await verifyPassword(row.password, base.password), true);
  });

  test('never returns the password field', async () => {
    const created = await repository.create({ ...base });

    assert.equal('password' in created, false);
  });

  test('Bob and bob are different logins', async () => {
    await repository.create({ ...base, login: 'Bob', email: 'a@example.com' });
    const lower = await repository.create({
      ...base,
      login: 'bob',
      email: 'b@example.com',
    });

    assert.equal(lower.login, 'bob');
    assert.equal(await User.count(), 2);
  });

  test('a repeated login is rejected', async () => {
    await repository.create({ ...base, login: 'Bob', email: 'a@example.com' });

    await assert.rejects(
      () =>
        repository.create({ ...base, login: 'Bob', email: 'c@example.com' }),
      (error: unknown) =>
        error instanceof ConflictError && error.statusCode === 409
    );
  });

  test('email stays case-insensitive, so Bob@ collides with bob@', async () => {
    await repository.create({
      ...base,
      login: 'first',
      email: 'bob@example.com',
    });

    await assert.rejects(
      () =>
        repository.create({
          ...base,
          login: 'second',
          email: 'Bob@example.com',
        }),
      (error: unknown) => error instanceof ConflictError
    );
  });

  test('paginates and reports the total', async () => {
    for (let i = 0; i < 5; i += 1) {
      await repository.create({
        ...base,
        login: `user${i}`,
        email: `user${i}@example.com`,
      });
    }

    const page = await repository.list({ limit: 2, offset: 2 });
    assert.equal(page.items.length, 2);
    assert.equal(page.total, 5);
  });

  test('filters by status', async () => {
    await repository.create({
      ...base,
      login: 'a',
      email: 'a@example.com',
      status: 'active',
    });
    await repository.create({
      ...base,
      login: 'b',
      email: 'b@example.com',
      status: 'blocked',
    });

    const blocked = await repository.list({
      limit: 20,
      offset: 0,
      status: 'blocked',
    });
    assert.equal(blocked.total, 1);
    assert.equal(blocked.items[0].login, 'b');
  });

  test('search stays case-insensitive even though login is not', async () => {
    await repository.create({
      ...base,
      login: 'Bob',
      email: 'bob@example.com',
    });

    const found = await repository.list({ limit: 20, offset: 0, q: 'bob' });
    assert.equal(found.total, 1);
  });

  test('a literal % in q is escaped rather than matching every row', async () => {
    await repository.create({
      ...base,
      login: 'alice',
      email: 'a@example.com',
    });
    await repository.create({
      ...base,
      login: 'carol',
      email: 'c@example.com',
    });

    const found = await repository.list({ limit: 20, offset: 0, q: '%' });
    assert.equal(found.total, 0);
  });

  test('updates a single field and leaves the rest alone', async () => {
    const created = await repository.create({ ...base });

    const updated = await repository.update(created.id, {
      firstName: 'Robert',
    });
    assert.ok(updated);
    assert.equal(updated.firstName, 'Robert');
    assert.equal(updated.lastName, base.lastName);
  });

  test('re-hashes when the password changes', async () => {
    const created = await repository.create({ ...base });
    const before = await User.unscoped().findByPk(created.id);

    await repository.update(created.id, { password: 'brand new password' });
    const after = await User.unscoped().findByPk(created.id);

    assert.ok(before && after);
    assert.notEqual(before.password, after.password);
    assert.equal(
      await verifyPassword(after.password, 'brand new password'),
      true
    );
  });

  const openTwoSessions = async (userId: number): Promise<void> => {
    const expiresAt = new Date(Date.now() + 60_000);
    await Session.bulkCreate([
      { userId, tokenHash: hashToken(`${userId}-a`), expiresAt },
      { userId, tokenHash: hashToken(`${userId}-b`), expiresAt },
    ]);
  };

  const sessionCount = (userId: number) => Session.count({ where: { userId } });

  test('blocking an account ends its sessions in the same update', async () => {
    const created = await repository.create({ ...base });
    await openTwoSessions(created.id);

    await repository.update(created.id, { status: 'blocked' });

    assert.equal(await sessionCount(created.id), 0);
  });

  test('re-blocking a blocked account and unblocking it leave sessions alone', async () => {
    const created = await repository.create({ ...base, status: 'blocked' });
    await openTwoSessions(created.id);

    await repository.update(created.id, { status: 'blocked' });
    assert.equal(await sessionCount(created.id), 2);

    await repository.update(created.id, { status: 'active' });
    assert.equal(await sessionCount(created.id), 2);
  });

  test('a password change ends every session', async () => {
    const created = await repository.create({ ...base });
    await openTwoSessions(created.id);

    await repository.update(created.id, { password: 'another-pass-1' });

    assert.equal(await sessionCount(created.id), 0);
  });

  test('an ordinary edit leaves sessions alone', async () => {
    const created = await repository.create({ ...base });
    await openTwoSessions(created.id);

    await repository.update(created.id, { firstName: 'Renamed' });

    assert.equal(await sessionCount(created.id), 2);
  });

  test('returns null for a missing record and false for a missing delete', async () => {
    assert.equal(await repository.findById(9999), null);
    assert.equal(await repository.update(9999, { firstName: 'X' }), null);
    assert.equal(await repository.remove(9999), false);
  });

  test('removes an existing record once', async () => {
    const created = await repository.create({ ...base });

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await repository.remove(created.id), false);
  });

  test('deleting an account turns its comments into deleted tombstones and keeps replies attached', async () => {
    const leaving = await repository.create({
      ...base,
      login: 'Leaving',
      email: 'leaving@example.com',
    });
    const staying = await repository.create({
      ...base,
      login: 'Staying',
      email: 'staying@example.com',
    });
    const host = await repository.create({
      ...base,
      login: 'Host',
      email: 'host@example.com',
    });
    const book = await createCreditedBook(
      { title: 'Host Book', description: 'Hosts the thread', tags: [] },
      [host.id]
    );
    const comment = await Comment.create({
      bookId: book.id,
      userId: leaving.id,
      text: 'My words',
    });
    const reply = await Comment.create({
      bookId: book.id,
      userId: staying.id,
      parentId: comment.id,
      text: 'A reply',
    });

    assert.equal(await repository.remove(leaving.id), true);

    const tombstone = await Comment.findByPk(comment.id);
    assert.equal(tombstone?.tombstone, 'deleted');
    assert.equal(tombstone?.userId, null);
    assert.equal((await Comment.findByPk(reply.id))?.parentId, comment.id);
  });

  test('deleting an account keeps its shared books and deletes the ones it alone was credited on', async () => {
    const leaving = await repository.create(
      { ...base, login: 'LeavingAuthor', email: 'leaving-author@example.com' },
      'author'
    );
    const staying = await repository.create(
      { ...base, login: 'StayingAuthor', email: 'staying-author@example.com' },
      'author'
    );
    // Created by the leaving account, so a cascade keyed on "who made it"
    // would take the shared book down too.
    const shared = await createCreditedBook(
      { title: 'Shared', description: 'Co-written', tags: [] },
      [leaving.id, staying.id]
    );
    const solo = await createCreditedBook(
      { title: 'Solo', description: 'Written alone', tags: [] },
      [leaving.id]
    );

    assert.equal(await repository.remove(leaving.id), true);

    assert.equal(await Book.findByPk(solo.id), null);
    assert.ok(await Book.findByPk(shared.id));
    const credits = await BookAuthor.findAll({ where: { bookId: shared.id } });
    assert.deepEqual(
      credits.map((credit) => credit.userId),
      [staying.id]
    );
  });

  test('a removed comment becomes deleted when its owner account goes', async () => {
    const leaving = await repository.create({
      ...base,
      login: 'Removed',
      email: 'removed@example.com',
    });
    const host = await repository.create({
      ...base,
      login: 'Host2',
      email: 'host2@example.com',
    });
    const book = await createCreditedBook(
      { title: 'Second Host', description: 'Hosts another thread', tags: [] },
      [host.id]
    );
    const comment = await Comment.create({
      bookId: book.id,
      userId: leaving.id,
      text: 'Moderated once',
      tombstone: 'removed',
    });

    await repository.remove(leaving.id);

    // Nothing can be restored to an owner who no longer exists.
    assert.equal((await Comment.findByPk(comment.id))?.tombstone, 'deleted');
  });

  test('deleting an account leaves its tombstones with the updatedAt they had', async () => {
    const leaving = await repository.create({
      ...base,
      login: 'Quiet',
      email: 'quiet@example.com',
    });
    const host = await repository.create({
      ...base,
      login: 'Host3',
      email: 'host3@example.com',
    });
    const book = await createCreditedBook(
      { title: 'Third Host', description: 'Hosts a third thread', tags: [] },
      [host.id]
    );
    const comment = await Comment.create({
      bookId: book.id,
      userId: leaving.id,
      text: 'Said once',
    });
    // Pinned well in the past, so a bump to "now" cannot hide inside the
    // column's one-second precision. Raw SQL, because a Model.update that
    // carries only updatedAt issues no statement at all; and a UTC string
    // rather than a Date, which a raw replacement formats in the machine's
    // own zone instead of the connection's.
    const earlier = new Date('2026-01-02T03:04:05Z');
    await sequelize.query(
      'UPDATE comments SET updatedAt = :at WHERE id = :id',
      {
        replacements: { at: '2026-01-02 03:04:05', id: comment.id },
      }
    );
    assert.equal(
      (await Comment.findByPk(comment.id))?.updatedAt.getTime(),
      earlier.getTime()
    );

    await repository.remove(leaving.id);

    // One timestamp shared by every tombstone the account left would link
    // them to each other and to the moment of the delete.
    const tombstone = await Comment.findByPk(comment.id);
    assert.equal(tombstone?.tombstone, 'deleted');
    assert.equal(tombstone?.updatedAt.getTime(), earlier.getTime());
  });

  test('findByLoginWithPassword returns the stored hash for a known login', async () => {
    await repository.create({
      ...base,
      login: 'Auth1',
      email: 'auth1@example.com',
    });

    const found = await repository.findByLoginWithPassword('Auth1');
    assert.ok(found);
    assert.equal(await verifyPassword(found.password, base.password), true);
  });

  test('findByLoginWithPassword is case-sensitive, matching the login collation', async () => {
    await repository.create({
      ...base,
      login: 'Auth2',
      email: 'auth2@example.com',
    });

    assert.equal(await repository.findByLoginWithPassword('auth2'), null);
  });

  test('findByLoginWithPassword returns null for an unknown login', async () => {
    assert.equal(await repository.findByLoginWithPassword('NoSuchUser'), null);
  });

  test('findByLoginWithPassword carries status, so a blocked user can be refused', async () => {
    await repository.create({
      ...base,
      login: 'Auth3',
      email: 'auth3@example.com',
      status: 'blocked',
    });

    assert.equal(
      (await repository.findByLoginWithPassword('Auth3'))?.status,
      'blocked'
    );
  });

  test('findByEmail is case-insensitive, matching the email collation', async () => {
    await repository.create({
      ...base,
      login: 'Auth4',
      email: 'auth4@example.com',
    });

    assert.ok(await repository.findByEmail('AUTH4@EXAMPLE.COM'));
  });

  test('findByEmail never exposes the password hash', async () => {
    await repository.create({
      ...base,
      login: 'Auth5',
      email: 'auth5@example.com',
    });

    const found = await repository.findByEmail('auth5@example.com');
    assert.ok(found);
    assert.equal('password' in found, false);
  });

  test('findPasswordHashById returns the stored hash, and it verifies', async () => {
    const created = await repository.create(base);
    const hash = await repository.findPasswordHashById(created.id);

    assert.ok(hash);
    assert.equal(await verifyPassword(hash, base.password), true);
  });

  test('findPasswordHashById returns null for a missing id', async () => {
    assert.equal(await repository.findPasswordHashById(999_999), null);
  });
});
