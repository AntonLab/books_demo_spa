import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, type LogSink } from './logger.ts';

function makeSink(): {
  calls: Array<{ level: string; args: unknown[] }>;
  sink: LogSink;
} {
  const calls: Array<{ level: string; args: unknown[] }> = [];
  const sink: LogSink = {
    info: (...args: unknown[]) => calls.push({ level: 'info', args }),
    warn: (...args: unknown[]) => calls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => calls.push({ level: 'error', args }),
  };
  return { calls, sink };
}

test('routes each level to the matching sink method', () => {
  const { calls, sink } = makeSink();
  const log = createLogger(sink);

  log.info('started');
  log.warn('careful');
  log.error('broken');

  assert.deepEqual(
    calls.map((c) => c.level),
    ['info', 'warn', 'error']
  );
});

test('includes the level and the message in the formatted line', () => {
  const { calls, sink } = makeSink();
  createLogger(sink).info('listening on 4000');

  assert.equal(calls.length, 1);
  assert.match(String(calls[0].args[0]), /INFO/);
  assert.match(String(calls[0].args[0]), /listening on 4000/);
});

test('passes meta through as a second argument only when given', () => {
  const { calls, sink } = makeSink();
  const log = createLogger(sink);

  log.info('no meta');
  log.error('with meta', { code: 'E_TEST' });

  assert.equal(calls[0].args.length, 1);
  assert.equal(calls[1].args.length, 2);
  assert.deepEqual(calls[1].args[1], { code: 'E_TEST' });
});
