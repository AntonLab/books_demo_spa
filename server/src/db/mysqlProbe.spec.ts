import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionErrorText, skipWithoutMysql } from './mysqlProbe.testkit.ts';

// Port 1 is reserved and nothing listens on it, so the connection is refused
// at once rather than waiting out the timeout.
const unreachable = {
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
};

test('fails when DB_USER is not set or MySQL is unreachable', async () => {
  await assert.rejects(skipWithoutMysql({}), /DB_USER is not set/);
  await assert.rejects(
    skipWithoutMysql(unreachable),
    /MySQL unreachable: .*ECONNREFUSED.*SKIP_MYSQL=1/
  );
});

test('skips with the reason instead under SKIP_MYSQL=1', async () => {
  assert.match(
    String(await skipWithoutMysql({ SKIP_MYSQL: '1' })),
    /DB_USER is not set/
  );
  assert.match(
    String(await skipWithoutMysql({ ...unreachable, SKIP_MYSQL: '1' })),
    /MySQL unreachable: .*ECONNREFUSED/
  );
});

test('names every refused address when localhost resolves to several', () => {
  const refused = (address: string) =>
    Object.assign(new Error(`connect ECONNREFUSED ${address}`), {
      code: 'ECONNREFUSED',
    });
  // What mysql2 throws for `localhost` when MySQL is down: the aggregate's own
  // message is empty.
  const error = Object.assign(
    new AggregateError([refused('::1:3306'), refused('127.0.0.1:3306')], ''),
    { code: 'ECONNREFUSED' }
  );

  assert.equal(
    connectionErrorText(error),
    'connect ECONNREFUSED ::1:3306; connect ECONNREFUSED 127.0.0.1:3306'
  );
});
