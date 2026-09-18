import test from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../logger.ts';
import { parseConfig, type AppConfig } from './config.ts';
import { DEMO_DATABASE, assertSafeTarget } from './seedGuards.ts';

function makeLogger(): {
  calls: Array<{ level: string; message: string; meta: unknown }>;
  logger: Logger;
} {
  const calls: Array<{ level: string; message: string; meta: unknown }> = [];
  const logger: Logger = {
    info: (message, meta) => calls.push({ level: 'info', message, meta }),
    warn: (message, meta) => calls.push({ level: 'warn', message, meta }),
    error: (message, meta) => calls.push({ level: 'error', message, meta }),
  };
  return { calls, logger };
}

function configFor(env: string, database: string): AppConfig {
  // RESET_DELIVERY is set so a production config parses at all: the refusal
  // under test is the seed's own, not production's missing delivery.
  return parseConfig({
    DB_USER: 'u',
    DB_PASSWORD: 'p',
    NODE_ENV: env,
    DB_NAME: database,
    RESET_DELIVERY: 'log',
  });
}

test('production is refused without --force', () => {
  const { calls, logger } = makeLogger();

  assert.throws(
    () =>
      assertSafeTarget(configFor('production', DEMO_DATABASE), false, logger),
    /NODE_ENV is production/
  );
  assert.deepEqual(calls, []);
});

test('production is refused with --force, even against the demo database', () => {
  const { calls, logger } = makeLogger();

  assert.throws(
    () =>
      assertSafeTarget(configFor('production', DEMO_DATABASE), true, logger),
    /NODE_ENV is production/
  );
  assert.throws(
    () => assertSafeTarget(configFor('production', 'elsewhere'), true, logger),
    /NODE_ENV is production/
  );
  assert.deepEqual(calls, []);
});

test('--force against another database warns, naming it, and does not throw', () => {
  const { calls, logger } = makeLogger();

  assertSafeTarget(configFor('development', 'elsewhere'), true, logger);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.level, 'warn');
  assert.match(calls[0]!.message, /--force given for a database other than/);
  assert.deepEqual(calls[0]!.meta, { database: 'elsewhere' });
});

test('--force against the demo database passes silently', () => {
  const { calls, logger } = makeLogger();

  assertSafeTarget(configFor('development', DEMO_DATABASE), true, logger);

  assert.deepEqual(calls, []);
});

test('without --force any non-production database passes silently', () => {
  const { calls, logger } = makeLogger();

  assertSafeTarget(configFor('development', DEMO_DATABASE), false, logger);
  assertSafeTarget(configFor('test', 'elsewhere'), false, logger);

  assert.deepEqual(calls, []);
});

test('the demo database is the one config.ts defaults to', () => {
  assert.equal(
    parseConfig({ DB_USER: 'u', DB_PASSWORD: 'p' }).db.database,
    DEMO_DATABASE
  );
});
