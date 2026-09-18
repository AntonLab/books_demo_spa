import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Logger } from './logger.ts';
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
  logs: string[];
  exits: number[];
  // Runs the callback the shutdown handed server.close().
  finishClose(): void;
  // The deadline the shutdown set, once it has set one.
  deadline(): { callback: () => void; ms: number; unrefed: boolean };
}

// Fakes for the server, the pool and the timer: no real signal, socket or
// clock is involved, so each test decides when the server finishes closing
// and whether the deadline fires.
function harness(
  closeSequelize: () => Promise<void> = async () => {}
): Harness {
  const calls: string[] = [];
  const logs: string[] = [];
  const exits: number[] = [];
  let closeCallback: (() => void) | undefined;
  let timer: { callback: () => void; ms: number; unrefed: boolean } | undefined;

  const logger: Logger = {
    info: (message) => logs.push(`info ${message}`),
    warn: (message) => logs.push(`warn ${message}`),
    error: (message) => logs.push(`error ${message}`),
  };

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
    logger,
    exit: (code) => {
      exits.push(code);
    },
    setTimer: (callback, ms) => {
      const created = { callback, ms, unrefed: false };
      timer = created;
      return {
        unref: () => {
          created.unrefed = true;
        },
      };
    },
  };

  return {
    deps,
    calls,
    logs,
    exits,
    finishClose() {
      assert.ok(closeCallback, 'server.close was never called');
      closeCallback();
    },
    deadline() {
      assert.ok(timer, 'no deadline was set');
      return timer;
    },
  };
}

test('stops every interval, closes the server, then the pool, and exits 0', async () => {
  const h = harness();
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

test('a second call joins the shutdown already under way', async () => {
  const h = harness();
  const shutdown = createShutdown(h.deps);

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(second, first);

  h.finishClose();
  await first;
  assert.equal(h.calls.filter((call) => call === 'server.close').length, 1);
  assert.equal(h.calls.filter((call) => call === 'sequelize.close').length, 1);
});

test('a shutdown that overruns its deadline drops every connection and exits 1', () => {
  const h = harness();
  void createShutdown(h.deps)('SIGTERM');

  const deadline = h.deadline();
  assert.equal(deadline.ms, SHUTDOWN_TIMEOUT_MS);
  assert.equal(SHUTDOWN_TIMEOUT_MS, 10_000);
  assert.equal(deadline.unrefed, true);

  deadline.callback();
  assert.ok(h.calls.includes('server.closeAllConnections'));
  assert.deepEqual(h.exits, [1]);
  assert.ok(h.logs.some((line) => line.startsWith('error Shutdown did not')));
});

test('a pool that fails to close is logged and exits 1', async () => {
  const h = harness(async () => {
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
