// The one place a MySQL-backed suite learns its schema name. Each suite takes
// a schema of its own (`<base>_<suffix>`) because node:test runs spec files in
// parallel processes, and two suites calling sync({ force: true }) on one
// database would drop each other's tables mid-run. dropTestDatabases finds the
// schemas by this base.

import { parseConfig, type DbConfig } from './config.ts';

export const TEST_DB_BASE = process.env.TEST_DB_NAME ?? 'books_demo_spa_test';

export function testDbName(suffix: string): string {
  return `${TEST_DB_BASE}_${suffix}`;
}

export function testDbConfig(suffix: string): DbConfig {
  return parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: testDbName(suffix),
  }).db;
}
