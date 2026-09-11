process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { QueryTypes, type Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { initModels, Session, User } from '../models/index.ts';
import { hashToken } from '../tokens.ts';
import {
  createSequelizeSessionRepository,
  type SessionOpening,
} from './sessionRepository.ts';
import { createSequelizeUserRepository } from './userRepository.ts';

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

  // The hash a login verified the password against, which the controller
  // hands back when it opens the session.
  async function storedHash(userId: number): Promise<string> {
    const user = await User.unscoped().findByPk(userId, {
      attributes: ['password'],
    });
    assert.ok(user);
    return user.password;
  }

  const sessionCount = (userId: number) => Session.count({ where: { userId } });

  const openFor = (userId: number, token: string, verifiedHash: string) =>
    repository.createIfCredentialCurrent(
      userId,
      hashToken(token),
      new Date(Date.now() + hour),
      verifiedHash
    );

  test('createIfCredentialCurrent opens the session while the verified hash is current', async () => {
    const userId = await makeUser('CurrentOwner');

    assert.equal(
      await openFor(userId, 'tok-current', await storedHash(userId)),
      'created'
    );
    assert.equal(
      (await repository.findValidByTokenHash(hashToken('tok-current')))?.userId,
      userId
    );
  });

  test('createIfCredentialCurrent opens nothing once the password has changed, even to the same one', async () => {
    const userId = await makeUser('ChangedOwner');
    const verified = await storedHash(userId);

    // The same plaintext makeUser set: argon2 salts every hash afresh, so even
    // this is a different credential.
    const user = await User.unscoped().findByPk(userId);
    assert.ok(user);
    user.password = 'hunter2hunter2';
    await user.save();

    assert.equal(
      await openFor(userId, 'tok-changed', verified),
      'credential-changed'
    );
    assert.equal(await sessionCount(userId), 0);
  });

  test('createIfCredentialCurrent opens nothing for a blocked account', async () => {
    const userId = await makeUser('BlockedOwner');
    const verified = await storedHash(userId);
    await User.update({ status: 'blocked' }, { where: { id: userId } });

    assert.equal(await openFor(userId, 'tok-blocked', verified), 'blocked');
    assert.equal(await sessionCount(userId), 0);
  });

  test('createIfCredentialCurrent opens nothing for an account that is gone', async () => {
    const userId = await makeUser('VanishedOwner');
    const verified = await storedHash(userId);
    await User.destroy({ where: { id: userId } });

    assert.equal(
      await openFor(userId, 'tok-vanished', verified),
      'credential-changed'
    );
    assert.equal(await sessionCount(userId), 0);
  });

  // Resolves once another connection of this suite is stuck inside a
  // statement on users or sessions — whichever side of the race the test
  // means to leave queued behind the lock it holds. An account always sees
  // its own threads in the process list, so this needs no PROCESS privilege.
  // Anything but 'Sleep' counts, because Sequelize sends a statement with
  // bind parameters — an INSERT — as a prepared one, which the list shows as
  // 'Execute'.
  async function untilAStatementWaits(): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const waiting = await sequelize.query(
        `SELECT ID FROM information_schema.PROCESSLIST
          WHERE DB = :db AND COMMAND <> 'Sleep' AND ID <> CONNECTION_ID()
            AND (INFO LIKE '%users%' OR INFO LIKE '%sessions%')`,
        { replacements: { db: TEST_DB_NAME }, type: QueryTypes.SELECT }
      );
      if (waiting.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('no statement ever queued behind the row lock');
  }

  // The race the re-check exists for, in the order that used to lose: a
  // login has verified the old hash, and a change already holds the account
  // row — FOR UPDATE, as userRepository.update takes it — when the session is
  // opened. The change commits its new state and its session purge while the
  // opening waits, and only then may the opening go on.
  async function openDuringChange(
    userId: number,
    token: string,
    change: (user: User) => void
  ): Promise<SessionOpening> {
    const verified = await storedHash(userId);
    let opening: Promise<SessionOpening> | undefined;

    await sequelize.transaction(async (transaction) => {
      const user = await User.unscoped().findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      assert.ok(user);

      opening = openFor(userId, token, verified);
      await untilAStatementWaits();

      change(user);
      await user.save({ transaction });
      await Session.destroy({ where: { userId }, transaction });
    });

    assert.ok(opening);
    return opening;
  }

  test('an opening that waits out a password change sees the new hash and opens nothing', async () => {
    const userId = await makeUser('RacePasswordOwner');

    const opening = await openDuringChange(userId, 'tok-race-password', (u) => {
      u.password = 'a-brand-new-password';
    });

    assert.equal(opening, 'credential-changed');
    assert.equal(await sessionCount(userId), 0);
  });

  test('an opening that waits out a block sees it and opens nothing', async () => {
    const userId = await makeUser('RaceBlockOwner');

    const opening = await openDuringChange(userId, 'tok-race-block', (u) => {
      u.status = 'blocked';
    });

    assert.equal(opening, 'blocked');
    assert.equal(await sessionCount(userId), 0);
  });

  // The other order: the opening's locking read comes first, so the change
  // has to queue behind it — and the session is then committed before the
  // change's purge runs, which must therefore find it.
  test('a password change that queues behind an opening purges the session it opened', async () => {
    const userId = await makeUser('RaceLoginFirstOwner');
    const verified = await storedHash(userId);
    const users = createSequelizeUserRepository();
    let change: Promise<unknown> | undefined;

    // Runs inside the opening's transaction, after its locking read and just
    // before its insert. The change starts here, as userRepository.update
    // runs it in production, and is left waiting on the shared lock.
    Session.addHook('beforeCreate', 'startChange', async () => {
      change = users.update(userId, { password: 'a-brand-new-password' });
      await untilAStatementWaits();
    });
    try {
      assert.equal(
        await openFor(userId, 'tok-login-first', verified),
        'created'
      );
    } finally {
      Session.removeHook('beforeCreate', 'startChange');
    }

    assert.ok(change);
    await change;
    assert.equal(await sessionCount(userId), 0);
  });
});
