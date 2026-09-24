// Teardown for the MySQL-backed suites, the mirror image of ensureDatabase:
// each suite creates a schema of its own, and this drops every one of them.
//
// It runs from npm's `posttest`, which is what ties it to a *successful* run —
// npm skips a `post*` script when the script it follows exits non-zero, so a
// failed suite leaves its rows on disk to be inspected, and only a green run
// clears them away.
//
// The suites are found by name rather than from a list: every one of them
// derives its schema from `TEST_DB_NAME ?? 'books_demo_spa_test'`, so that
// prefix is the whole test namespace, and a suite added later is cleaned up
// without anyone remembering to add it here.

import mysql, { type RowDataPacket } from 'mysql2/promise';
import { logger } from '../logger.ts';
import { parseConfig } from './config.ts';
import { SAFE_IDENTIFIER } from './ensureDatabase.ts';
import { connectionErrorText } from './mysqlProbe.testkit.ts';

const TEST_DB_BASE = process.env.TEST_DB_NAME ?? 'books_demo_spa_test';

function isTestSchema(name: string): boolean {
  return name === TEST_DB_BASE || name.startsWith(`${TEST_DB_BASE}_`);
}

async function dropTestDatabases(): Promise<void> {
  // Under SKIP_MYSQL=1 the MySQL suites may have skipped rather than passed, so
  // there may be no server to reach. Checked before parseConfig, which throws
  // on a missing DB_USER.
  if (process.env.SKIP_MYSQL === '1') {
    logger.info('Test schema cleanup skipped: SKIP_MYSQL is set');
    return;
  }
  // A green run without SKIP_MYSQL had credentials, or the suites would have
  // failed; this guards a cleanup run on its own.
  if (!process.env.DB_USER) {
    logger.info('Test schema cleanup skipped: DB_USER is not set');
    return;
  }

  const { db } = parseConfig(process.env);

  if (!SAFE_IDENTIFIER.test(TEST_DB_BASE)) {
    throw new Error(
      `Refusing to drop schemas under an unsafe name: ${TEST_DB_BASE}`
    );
  }

  // The one way this could reach live data: TEST_DB_NAME pointed at the
  // application's own schema. Refuse rather than drop it.
  if (isTestSchema(db.database)) {
    throw new Error(
      `Refusing to drop ${db.database}: DB_NAME names it, so it is not a test schema`
    );
  }

  // Connects with no database selected, like ensureDatabase: the schemas being
  // dropped cannot be the connection's own.
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      connectTimeout: 4000,
    });
  } catch (error) {
    // The suites passed, so the server went away after them. Warn and leave
    // the run green: a failed cleanup says nothing about the code.
    logger.warn(
      `Test schema cleanup skipped: MySQL unreachable — ${connectionErrorText(error)}`
    );
    return;
  }

  try {
    const [rows] = await connection.query<RowDataPacket[]>('SHOW DATABASES');
    const names = rows
      .map((row) => String(row.Database))
      .filter((name) => isTestSchema(name) && SAFE_IDENTIFIER.test(name));

    if (names.length === 0) {
      logger.info('Test schema cleanup: nothing to drop');
      return;
    }

    for (const name of names) {
      await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    }

    logger.info(`Dropped ${names.length} test schema(s)`, names.join(', '));
  } finally {
    await connection.end();
  }
}

try {
  await dropTestDatabases();
} catch (error) {
  logger.error('Test schema cleanup failed', (error as Error).message);
  process.exitCode = 1;
}
