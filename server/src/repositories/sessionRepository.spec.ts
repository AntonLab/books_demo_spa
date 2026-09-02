process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { initModels, User } from '../models/index.ts';
import { hashToken } from '../tokens.ts';
import { createSequelizeSessionRepository } from './sessionRepository.ts';

// A schema of its own rather than the users suite's: node:test runs spec
// files in parallel processes, and two suites calling sync({ force: true })
// on one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_sessions`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
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

describe('sessionRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeSessionRepository();

  before(async () => {
    const db = testDbConfig();
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  async function makeUser(login = 'SessionOwner'): Promise<number> {
    const user = await User.create({
      login,
      email: `${login.toLowerCase()}@example.com`,
      password: 'hunter2hunter2',
      firstName: 'Session',
      lastName: 'Owner',
    });
    return user.id;
  }

  const hour = 60 * 60 * 1000;

  test('a fresh session is found by its token hash', async () => {
    const userId = await makeUser('FreshOwner');
    await repository.create(
      userId,
      hashToken('tok-fresh'),
      new Date(Date.now() + hour)
    );

    const found = await repository.findValidByTokenHash(hashToken('tok-fresh'));
    assert.equal(found?.userId, userId);
  });

  test('an expired session is not found', async () => {
    const userId = await makeUser('ExpiredOwner');
    await repository.create(
      userId,
      hashToken('tok-old'),
      new Date(Date.now() - hour)
    );

    assert.equal(
      await repository.findValidByTokenHash(hashToken('tok-old')),
      null
    );
  });

  test('an unknown token hash is not found', async () => {
    assert.equal(
      await repository.findValidByTokenHash(hashToken('nope')),
      null
    );
  });

  test('deleteByTokenHash revokes exactly one session', async () => {
    const userId = await makeUser('LogoutOwner');
    await repository.create(
      userId,
      hashToken('tok-a'),
      new Date(Date.now() + hour)
    );
    await repository.create(
      userId,
      hashToken('tok-b'),
      new Date(Date.now() + hour)
    );

    assert.equal(await repository.deleteByTokenHash(hashToken('tok-a')), true);
    assert.equal(
      await repository.findValidByTokenHash(hashToken('tok-a')),
      null
    );
    assert.ok(await repository.findValidByTokenHash(hashToken('tok-b')));
  });

  test('deleteByTokenHash reports false when nothing matched', async () => {
    assert.equal(await repository.deleteByTokenHash(hashToken('ghost')), false);
  });

  test('deleteAllForUser revokes every session that user holds', async () => {
    const userId = await makeUser('ResetOwner');
    await repository.create(
      userId,
      hashToken('tok-1'),
      new Date(Date.now() + hour)
    );
    await repository.create(
      userId,
      hashToken('tok-2'),
      new Date(Date.now() + hour)
    );

    assert.equal(await repository.deleteAllForUser(userId), 2);
    assert.equal(
      await repository.findValidByTokenHash(hashToken('tok-1')),
      null
    );
    assert.equal(
      await repository.findValidByTokenHash(hashToken('tok-2')),
      null
    );
  });

  test('deleting a user takes their sessions with them', async () => {
    const userId = await makeUser('DoomedOwner');
    await repository.create(
      userId,
      hashToken('tok-doom'),
      new Date(Date.now() + hour)
    );

    await User.destroy({ where: { id: userId } });
    assert.equal(
      await repository.findValidByTokenHash(hashToken('tok-doom')),
      null
    );
  });
});
