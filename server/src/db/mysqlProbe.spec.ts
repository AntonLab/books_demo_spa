import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipWithoutMysql } from './mysqlProbe.testkit.ts';

// Port 1 is reserved and nothing listens on it, so the connection is refused
// at once rather than waiting out the timeout.
const unreachable = {
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
};

test('skips with a reason when DB_USER is not set', async () => {
  assert.match(String(await skipWithoutMysql({})), /DB_USER is not set/);
});

test('skips with a reason when MySQL is unreachable', async () => {
  assert.match(
    String(await skipWithoutMysql(unreachable)),
    /MySQL unreachable/
  );
});

test('throws instead of skipping under REQUIRE_MYSQL=1', async () => {
  await assert.rejects(
    skipWithoutMysql({ REQUIRE_MYSQL: '1' }),
    /REQUIRE_MYSQL is set but DB_USER is not set/
  );
  await assert.rejects(
    skipWithoutMysql({ ...unreachable, REQUIRE_MYSQL: '1' }),
    /REQUIRE_MYSQL is set but MySQL unreachable/
  );
});
