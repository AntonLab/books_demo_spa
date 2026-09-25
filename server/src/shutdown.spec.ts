import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { recordLogs } from './logger.testkit.ts';
import {
  createShutdown,
  registerShutdownSignals,
  SHUTDOWN_TIMEOUT_MS,
  type ShutdownDeps,
} from './shutdown.ts';

interface Harness {
  deps: ShutdownDeps;
  // Every call the shutdown made on its collaborators, in order.
  calls: string[];
  // What the shutdown logged, as `<level> <message>`.
  readonly logs: string[];
  exits: number[];
  // Runs the callback the shutdown handed server.close().
  finishClose(): void;
}

// Fakes for the server and the pool, and setTimeout mocked: no real signal,
// socket or clock is involved, so each test decides when the server finishes
// closing and whether the deadline fires.
function harness(
  t: TestContext,
  closeSequelize: () => Promise<void> = async () => {}
): Harness {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const lines = recordLogs(t);
  const exits: number[] = [];
  let closeCallback: (() => void) | undefined;

  const deps: ShutdownDeps = {
    server: {
      close(callback) {
        calls.push('server.close');
        closeCallback = () => callback();
      },
      closeIdleConnections() {
        calls.push('server.closeIdleConnections');
      },
      closeAllConnections() {
        calls.push('server.closeAllConnections');
      },
    },
    sequelize: {
      async close() {
        calls.push('sequelize.close');
        await closeSequelize();
      },
    },
    stoppables: [
      { stop: () => calls.push('purge.stop') },
      { stop: () => calls.push('limits.stop') },
    ],
    exit: (code) => {
      exits.push(code);
    },
  };

  return {
    deps,
    calls,
    get logs() {
      return lines.map((line) => `${line.level} ${line.message}`);
    },
    exits,
    finishClose() {
      assert.ok(closeCallback, 'server.close was never called');
      closeCallback();
    },
  };
}

test('stops every interval, closes the server, then the pool, and exits 0', async (t) => {
  const h = harness(t);
  const exitCodeBefore = process.exitCode;
  const done = createShutdown(h.deps)('SIGTERM');

  assert.deepEqual(h.calls, [
    'purge.stop',
    'limits.stop',
    'server.close',
    'server.closeIdleConnections',
  ]);

  h.finishClose();
  await done;

  // The pool closes only once the server has finished closing.
  assert.deepEqual(h.calls.slice(4), ['sequelize.close']);
  assert.deepEqual(h.exits, []);
  assert.equal(process.exitCode, exitCodeBefore);
  assert.deepEqual(h.logs, [
    'info Shutting down (SIGTERM)',
    'info Shutdown complete',
  ]);
});

test('a second call joins the shutdown already under way', async (t) => {
  const h = harness(t);
  const shutdown = createShutdown(h.deps);

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(second, first);

  h.finishClose();
  await first;
  assert.equal(h.calls.filter((call) => call === 'server.close').length, 1);
  assert.equal(h.calls.filter((call) => call === 'sequelize.close').length, 1);
});

test('a shutdown that overruns its deadline drops every connection and exits 1', (t) => {
  const h = harness(t);
  // The shutdown keeps no handle to its deadline, so unref() is watched on
  // the prototype the mocked handles share.
  const unref = t.mock.method(
    Object.getPrototypeOf(setTimeout(() => {}, 0)) as { unref(): unknown },
    'unref'
  );
  void createShutdown(h.deps)('SIGTERM');
  assert.equal(unref.mock.callCount(), 1);
  assert.equal(SHUTDOWN_TIMEOUT_MS, 10_000);

  t.mock.timers.tick(SHUTDOWN_TIMEOUT_MS - 1);
  assert.deepEqual(h.exits, []);
  t.mock.timers.tick(1);
  assert.ok(h.calls.includes('server.closeAllConnections'));
  assert.deepEqual(h.exits, [1]);
  assert.ok(h.logs.some((line) => line.startsWith('error Shutdown did not')));
});

test('a pool that fails to close is logged and exits 1', async (t) => {
  const h = harness(t, async () => {
    throw new Error('pool gone');
  });
  const done = createShutdown(h.deps)('SIGTERM');

  h.finishClose();
  await done;
  assert.deepEqual(h.exits, [1]);
  assert.ok(h.logs.includes('error Shutdown failed'));
});

test('SIGTERM and SIGINT each start the shutdown, and each is heard once', () => {
  const target = new EventEmitter();
  const reasons: string[] = [];
  registerShutdownSignals(async (reason) => {
    reasons.push(reason);
  }, target);

  target.emit('SIGTERM');
  target.emit('SIGTERM');
  target.emit('SIGINT');

  assert.deepEqual(reasons, ['SIGTERM', 'SIGINT']);
  assert.equal(target.listenerCount('SIGTERM'), 0);
  assert.equal(target.listenerCount('SIGINT'), 0);
});
