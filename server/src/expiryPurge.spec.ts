import test from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from './logger.ts';
import {
  EXPIRY_PURGE_INTERVAL_MS,
  purgeExpiredRows,
  startExpiryPurge,
  type ExpiryPurgeDeps,
} from './expiryPurge.ts';
import { RESET_TOKEN_RETENTION_MS } from './repositories/passwordResetRepository.ts';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');

interface Line {
  level: string;
  message: string;
  meta: unknown;
}

// Fake repositories that record the moment each was asked about and answer
// with a fixed count, or fail.
function fakes(
  answer: { sessions?: number; resetTokens?: number; failure?: Error } = {}
) {
  const lines: Line[] = [];
  const sessionMoments: Date[] = [];
  const resetCutoffs: Date[] = [];
  const logger: Logger = {
    info: (message, meta) => lines.push({ level: 'info', message, meta }),
    warn: (message, meta) => lines.push({ level: 'warn', message, meta }),
    error: (message, meta) => lines.push({ level: 'error', message, meta }),
  };
  const deps: ExpiryPurgeDeps = {
    sessionRepository: {
      async deleteExpired(now) {
        sessionMoments.push(now);
        if (answer.failure) throw answer.failure;
        return answer.sessions ?? 0;
      },
    },
    passwordResetRepository: {
      async deleteExpiredBefore(cutoff) {
        resetCutoffs.push(cutoff);
        return answer.resetTokens ?? 0;
      },
    },
    logger,
    now: () => NOW,
  };
  return { deps, lines, sessionMoments, resetCutoffs };
}

test('deletes the sessions expired by now and the reset tokens 30 days past their expiry', async () => {
  const { deps, sessionMoments, resetCutoffs } = fakes();

  await purgeExpiredRows(deps);

  assert.deepEqual(sessionMoments, [new Date(NOW)]);
  assert.deepEqual(resetCutoffs, [new Date(NOW - RESET_TOKEN_RETENTION_MS)]);
  assert.equal(RESET_TOKEN_RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
});

test('logs the counts at info when it deleted something', async () => {
  const { deps, lines } = fakes({ sessions: 3, resetTokens: 1 });

  await purgeExpiredRows(deps);

  assert.deepEqual(lines, [
    {
      level: 'info',
      message: 'Purged expired rows',
      meta: { sessions: 3, resetTokens: 1 },
    },
  ]);
});

test('logs nothing when nothing had expired', async () => {
  const { deps, lines } = fakes();

  await purgeExpiredRows(deps);

  assert.deepEqual(lines, []);
});

test('a failed pass is logged at error and does not reject', async () => {
  const { deps, lines } = fakes({ failure: new Error('connection lost') });

  await purgeExpiredRows(deps);

  assert.deepEqual(lines, [
    { level: 'error', message: 'Expiry purge failed', meta: 'connection lost' },
  ]);
});

test('runs once at start, then once per interval until stopped', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { deps, sessionMoments } = fakes();

  const purge = startExpiryPurge({ ...deps, intervalMs: 1_000 });
  assert.equal(sessionMoments.length, 1);

  t.mock.timers.tick(1_000);
  assert.equal(sessionMoments.length, 2);
  t.mock.timers.tick(2_000);
  assert.equal(sessionMoments.length, 4);

  purge.stop();
  t.mock.timers.tick(5_000);
  assert.equal(sessionMoments.length, 4);
});

test('runs hourly by default', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { deps, sessionMoments } = fakes();

  const purge = startExpiryPurge(deps);
  t.mock.timers.tick(EXPIRY_PURGE_INTERVAL_MS - 1);
  assert.equal(sessionMoments.length, 1);
  t.mock.timers.tick(1);
  assert.equal(sessionMoments.length, 2);
  assert.equal(EXPIRY_PURGE_INTERVAL_MS, 60 * 60 * 1000);

  purge.stop();
});
