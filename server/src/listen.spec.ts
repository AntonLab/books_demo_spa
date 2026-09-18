import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import express from 'express';
import type { Logger } from './logger.ts';
import { listen } from './listen.ts';

interface Line {
  level: string;
  message: string;
  meta: unknown;
}

function recordingLogger(): { logger: Logger; lines: Line[] } {
  const lines: Line[] = [];
  return {
    lines,
    logger: {
      info: (message, meta) => lines.push({ level: 'info', message, meta }),
      warn: (message, meta) => lines.push({ level: 'warn', message, meta }),
      error: (message, meta) => lines.push({ level: 'error', message, meta }),
    },
  };
}

const close = (server: { close(callback: () => void): unknown }) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

test('a bound server logs that it is listening and reports no error', async () => {
  const { logger, lines } = recordingLogger();
  const errors: Error[] = [];
  const server = listen(express(), 0, {
    logger,
    onError: (error) => errors.push(error),
  });
  await once(server, 'listening');

  try {
    assert.deepEqual(errors, []);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.level, 'info');
    assert.match(
      lines[0]!.message,
      /^server listening on http:\/\/127\.0\.0\.1:\d+$/
    );
  } finally {
    await close(server);
  }
});

test('a port already taken is logged as a failure and handed to onError, never as listening', async () => {
  const blocker = createServer();
  blocker.listen(0);
  await once(blocker, 'listening');
  const { port } = blocker.address() as AddressInfo;
  const { logger, lines } = recordingLogger();

  try {
    const error = await new Promise<Error>((resolve) => {
      listen(express(), port, { logger, onError: resolve });
    });

    assert.equal((error as NodeJS.ErrnoException).code, 'EADDRINUSE');
    assert.deepEqual(lines, [
      {
        level: 'error',
        message: 'Could not start the HTTP server',
        meta: error.message,
      },
    ]);
  } finally {
    await close(blocker);
  }
});
