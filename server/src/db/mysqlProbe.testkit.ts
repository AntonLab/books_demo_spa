// Decides whether a MySQL-backed suite runs, for the `{ skip }` option of its
// top-level describe.
//
// Locally a missing or unreachable MySQL skips the suite, so `npm test` stays
// usable on a machine with no database. CI sets REQUIRE_MYSQL=1, and there the
// same two conditions throw instead: a skipped suite exits 0, so without this a
// broken service container or a renamed variable would turn the integration
// tests off while the build stayed green.

import mysql from 'mysql2/promise';
import { parseConfig } from './config.ts';

export async function skipWithoutMysql(
  env: NodeJS.ProcessEnv = process.env
): Promise<false | string> {
  const reason = await unavailableReason(env);
  if (reason === null) return false;
  if (env.REQUIRE_MYSQL === '1') {
    throw new Error(`REQUIRE_MYSQL is set but ${reason}`);
  }
  return reason;
}

async function unavailableReason(
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  if (!env.DB_USER) return 'DB_USER is not set — configure server/.env.local';
  try {
    // Connects with no database selected: the suite's own schema may not exist
    // yet, and only the credentials are in question here.
    const { db } = parseConfig({ ...env, NODE_ENV: 'test' });
    const connection = await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      connectTimeout: 4000,
    });
    await connection.end();
    return null;
  } catch (error) {
    return `MySQL unreachable: ${(error as Error).message}`;
  }
}
