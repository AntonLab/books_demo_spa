import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { logger } from './logger.ts';

function spyOnConsole(t: TestContext) {
  const levels = ['info', 'warn', 'error'] as const;
  const calls: Array<{ level: string; args: unknown[] }> = [];
  for (const level of levels) {
    t.mock.method(console, level, (...args: unknown[]) => {
      calls.push({ level, args });
    });
  }
  return calls;
}

test('routes each level to the matching console method', (t) => {
  const calls = spyOnConsole(t);

  logger.info('started');
  logger.warn('careful');
  logger.error('broken');

  assert.deepEqual(
    calls.map((c) => c.level),
    ['info', 'warn', 'error']
  );
});

test('includes the level and the message in the formatted line', (t) => {
  const calls = spyOnConsole(t);
  logger.info('listening on 4000');

  assert.equal(calls.length, 1);
  assert.match(String(calls[0]!.args[0]), /INFO/);
  assert.match(String(calls[0]!.args[0]), /listening on 4000/);
});

test('passes meta through as a second argument only when given', (t) => {
  const calls = spyOnConsole(t);

  logger.info('no meta');
  logger.error('with meta', { code: 'E_TEST' });

  assert.equal(calls[0]!.args.length, 1);
  assert.equal(calls[1]!.args.length, 2);
  assert.deepEqual(calls[1]!.args[1], { code: 'E_TEST' });
});
