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
import { verifyPassword } from '../password.ts';
import { createSequelizeSessionRepository } from './sessionRepository.ts';
import { createSequelizePasswordResetRepository } from './passwordResetRepository.ts';

// A schema of its own rather than the sessions or users suite's: node:test
// runs spec files in parallel processes, and two suites calling
// sync({ force: true }) on one database would drop each other's tables
// mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_password_resets`;

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

describe('passwordResetRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizePasswordResetRepository();

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

  async function makeUser(login = 'ResetOwner'): Promise<number> {
    const user = await User.create({
      login,
      email: `${login.toLowerCase()}@example.com`,
      password: 'hunter2hunter2',
      firstName: 'Reset',
      lastName: 'Owner',
    });
    return user.id;
  }

  const hour = 60 * 60 * 1000;

  test('redeem changes the password', async () => {
    const userId = await makeUser('RedeemOwner');
    await repository.create(
      userId,
      hashToken('r1'),
      new Date(Date.now() + hour)
    );

    assert.equal(
      await repository.redeem(hashToken('r1'), 'newpassword123'),
      true
    );

    const user = await User.unscoped().findByPk(userId);
    assert.ok(user);
    assert.equal(await verifyPassword(user.password, 'newpassword123'), true);
  });

  test('redeem stores the new password hashed, never in plaintext', async () => {
    const userId = await makeUser('HashOwner');
    await repository.create(
      userId,
      hashToken('r2'),
      new Date(Date.now() + hour)
    );
    await repository.redeem(hashToken('r2'), 'newpassword123');

    const user = await User.unscoped().findByPk(userId);
    assert.notEqual(user?.password, 'newpassword123');
  });

  test('redeem revokes every session the user held', async () => {
    const userId = await makeUser('RevokeOwner');
    const sessions = createSequelizeSessionRepository();
    await sessions.create(
      userId,
      hashToken('live'),
      new Date(Date.now() + hour)
    );
    await repository.create(
      userId,
      hashToken('r3'),
      new Date(Date.now() + hour)
    );

    await repository.redeem(hashToken('r3'), 'newpassword123');

    assert.equal(await sessions.findValidByTokenHash(hashToken('live')), null);
  });

  test('a token cannot be redeemed twice', async () => {
    const userId = await makeUser('OnceOwner');
    await repository.create(
      userId,
      hashToken('r4'),
      new Date(Date.now() + hour)
    );

    assert.equal(
      await repository.redeem(hashToken('r4'), 'newpassword123'),
      true
    );
    assert.equal(
      await repository.redeem(hashToken('r4'), 'thirdpassword12'),
      false
    );
  });

  test('an expired token cannot be redeemed', async () => {
    const userId = await makeUser('StaleOwner');
    await repository.create(
      userId,
      hashToken('r5'),
      new Date(Date.now() - hour)
    );

    assert.equal(
      await repository.redeem(hashToken('r5'), 'newpassword123'),
      false
    );
  });

  test('an unknown token cannot be redeemed', async () => {
    assert.equal(
      await repository.redeem(hashToken('ghost'), 'newpassword123'),
      false
    );
  });

  test('a failed redeem leaves the old password working', async () => {
    const userId = await makeUser('IntactOwner');
    await repository.redeem(hashToken('ghost2'), 'newpassword123');

    const user = await User.unscoped().findByPk(userId);
    assert.ok(user);
    assert.equal(await verifyPassword(user.password, 'hunter2hunter2'), true);
  });

  test('invalidateAllForUser stops earlier tokens being redeemed', async () => {
    const userId = await makeUser('SupersededOwner');
    await repository.create(
      userId,
      hashToken('r6'),
      new Date(Date.now() + hour)
    );

    await repository.invalidateAllForUser(userId);

    assert.equal(
      await repository.redeem(hashToken('r6'), 'newpassword123'),
      false
    );
  });
});
