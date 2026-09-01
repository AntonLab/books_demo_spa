import mysql from 'mysql2/promise';
import type { DbConfig } from './config.ts';

// A schema name cannot be a bind parameter, so it is checked against an
// allowlist instead of being interpolated blindly.
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

export async function ensureDatabase(db: DbConfig): Promise<void> {
  if (!SAFE_IDENTIFIER.test(db.database)) {
    throw new Error(
      `Refusing to create a database with an unsafe name: ${db.database}`
    );
  }

  // Connects with no database selected: Sequelize cannot create its own schema,
  // so without this a first run on a clean machine fails with ER_BAD_DB_ERROR.
  const connection = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.username,
    password: db.password,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${db.database}\` ` +
        `CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  } finally {
    await connection.end();
  }
}
