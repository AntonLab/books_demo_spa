// Decides whether a MySQL-backed suite runs, for the `{ skip }` option of its
// top-level describe.
//
// A missing or unreachable MySQL throws, failing the spec file: a skipped suite
// exits 0, so a broken database or a renamed variable would otherwise turn the
// integration tests off while the run stayed green. SKIP_MYSQL=1 is the one way
// to skip them instead, on a machine with no database.

import mysql from 'mysql2/promise';
import { parseConfig } from './config.ts';

export async function skipWithoutMysql(
  env: NodeJS.ProcessEnv = process.env
): Promise<false | string> {
  const reason = await unavailableReason(env);
  if (reason === null) return false;
  if (env.SKIP_MYSQL === '1') return reason;
  throw new Error(`${reason} (set SKIP_MYSQL=1 to skip these suites)`);
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
    return `MySQL unreachable: ${connectionErrorText(error)}`;
  }
}

// mysql2 tries every address `localhost` resolves to and, when all refuse,
// throws an AggregateError whose own message is empty; the reasons are in
// its `errors`.
export function connectionErrorText(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(connectionErrorText).join('; ');
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return error.message || code || error.name;
  }
  return String(error);
}
