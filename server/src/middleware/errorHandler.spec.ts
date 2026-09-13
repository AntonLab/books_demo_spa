import test, { describe, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import type { Request, Response } from 'express';
import { DatabaseError, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import { errorHandler } from './errorHandler.ts';
import { logger } from '../logger.ts';
import { withApp } from '../routes/routeTestKit.testkit.ts';
import { ConflictError, NotFoundError } from '../types/errors.ts';

const PASSWORD = 'hunter2-plaintext-password';
const PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

// Replaces every logger level for the duration of one test, so a leak through
// any of them is caught and nothing reaches the console.
function recordLogs(t: TestContext): Array<{ level: string; args: unknown[] }> {
  const calls: Array<{ level: string; args: unknown[] }> = [];
  for (const level of ['info', 'warn', 'error'] as const) {
    t.mock.method(logger, level, (...args: unknown[]) => {
      calls.push({ level, args });
    });
  }
  return calls;
}

// Rendered the way console would print it, hidden properties included, so a
// secret on an error object logged whole would show up here.
const rendered = (value: unknown) =>
  inspect(value, { depth: Infinity, showHidden: true });

function handle(error: unknown): { status?: number; body?: unknown } {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
      return response;
    },
  } as unknown as Response;
  errorHandler(error, {} as Request, response, () =>
    assert.fail('errorHandler must answer, not pass the error on')
  );
  return sent;
}

test('an AppError answers with its own status and message, and details only when it has some', () => {
  assert.deepEqual(handle(new NotFoundError('Book', 7)), {
    status: 404,
    body: { error: 'Book 7 not found' },
  });
  assert.deepEqual(handle(new ConflictError('login')), {
    status: 409,
    body: { error: 'login is already taken', details: { field: 'login' } },
  });
});

test('a ZodError that escapes validate() is still a 400 carrying its issues', () => {
  const result = z.object({ title: z.string() }).safeParse({ title: 42 });
  if (result.success) assert.fail('the fixture must fail to parse');

  assert.deepEqual(handle(result.error), {
    status: 400,
    body: { error: 'Request validation failed', details: result.error.issues },
  });
});

test('a UniqueConstraintError is a bare 409 that names neither the field nor the value', (t) => {
  const logs = recordLogs(t);
  const error = new UniqueConstraintError({
    message: 'Validation error',
    fields: { email: 'bob@example.com' },
    parent: Object.assign(
      new Error("Duplicate entry 'bob@example.com' for key 'users.email'"),
      { sql: "INSERT INTO `users` (`email`) VALUES ('bob@example.com')" }
    ),
  });

  assert.deepEqual(handle(error), { status: 409, body: { error: 'Conflict' } });
  assert.deepEqual(logs, []);
});

describe('client faults', () => {
  test('a 4xx statusCode, or a 4xx status on its own, is answered as an invalid request', (t) => {
    const logs = recordLogs(t);
    const faults = [
      { statusCode: 400 },
      { statusCode: 499 },
      { statusCode: 413, status: 413 },
      { status: 415 },
    ];
    for (const fault of faults) {
      const code = fault.statusCode ?? fault.status;
      assert.deepEqual(
        handle(Object.assign(new Error('client fault'), fault)),
        { status: code, body: { error: 'Invalid request' } },
        JSON.stringify(fault)
      );
    }
    assert.deepEqual(logs, []);
  });

  // body-parser's `entity.parse.failed` carries the raw body as an own
  // property, which is exactly what this branch must never echo or log.
  test('the raw body a parse failure carries is neither echoed nor logged', (t) => {
    const logs = recordLogs(t);
    const error = Object.assign(
      new SyntaxError('Unexpected end of JSON input'),
      {
        status: 400,
        statusCode: 400,
        type: 'entity.parse.failed',
        body: `{"login":"bob","password":"${PASSWORD}"`,
      }
    );
    assert.match(rendered(error), new RegExp(PASSWORD));

    const sent = handle(error);

    assert.deepEqual(sent, { status: 400, body: { error: 'Invalid request' } });
    assert.deepEqual(logs, []);
  });

  test('anything but a numeric 4xx statusCode is a server fault, and a 5xx statusCode beside a 4xx status stays one', (t) => {
    const logs = recordLogs(t);
    const notFaults: Array<Record<string, unknown>> = [
      { statusCode: 503 },
      { statusCode: 500 },
      { statusCode: 399 },
      { statusCode: '400' },
      { status: '404' },
      { statusCode: 503, status: 400 },
    ];
    for (const shape of notFaults) {
      assert.deepEqual(
        handle(Object.assign(new Error('server fault'), shape)),
        { status: 500, body: { error: 'Internal Server Error' } },
        JSON.stringify(shape)
      );
    }
    assert.equal(logs.length, notFaults.length);
  });
});

describe('unhandled errors', () => {
  test('are a 500 logged by name, message and stack only, never with the SQL or its bound values', (t) => {
    const logs = recordLogs(t);
    const error = new DatabaseError(
      Object.assign(new Error("Unknown column 'nickname' in 'field list'"), {
        sql: 'UPDATE `users` SET `password` = ?, `nickname` = ? WHERE `id` = ?',
        parameters: [PASSWORD_HASH, 'bob', 7],
      })
    );
    // The error logged whole would leak both.
    assert.match(rendered(error), /UPDATE `users`/);
    assert.ok(rendered(error).includes(PASSWORD_HASH));

    const sent = handle(error);

    assert.deepEqual(sent, {
      status: 500,
      body: { error: 'Internal Server Error' },
    });
    assert.deepEqual(logs, [
      {
        level: 'error',
        args: [
          'Unhandled error',
          {
            name: 'SequelizeDatabaseError',
            message: "Unknown column 'nickname' in 'field list'",
            stack: error.stack,
          },
        ],
      },
    ]);
    assert.equal(rendered(logs).includes(PASSWORD_HASH), false);
    assert.doesNotMatch(rendered(logs), /UPDATE `users`/);
  });

  test('a thrown value that is not an Error is logged as an UnknownError', (t) => {
    const logs = recordLogs(t);

    for (const thrown of ['connection lost', null]) {
      assert.deepEqual(handle(thrown), {
        status: 500,
        body: { error: 'Internal Server Error' },
      });
    }

    assert.deepEqual(
      logs.map(({ args }) => args[1]),
      [
        { name: 'UnknownError', message: 'connection lost', stack: undefined },
        { name: 'UnknownError', message: 'null', stack: undefined },
      ]
    );
  });
});

// express.json() runs ahead of CSRF protection and every route, so these reach
// errorHandler straight from body-parser. A body that parsed would reach the
// login route instead, whose validate() answers 'Request validation failed'
// and whose repositories throw — never 'Invalid request'.
describe('through the app', () => {
  test('a malformed JSON body is a 400 that neither echoes nor logs it', async (t) => {
    const logs = recordLogs(t);

    await withApp({}, async (base) => {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"login":"bob","password":"${PASSWORD}"`,
      });

      assert.equal(response.status, 400);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { error: 'Invalid request' });
      assert.equal(text.includes(PASSWORD), false);
    });

    assert.equal(rendered(logs).includes(PASSWORD), false);
  });

  test('a body over the size limit, or in a charset body-parser refuses, keeps its own 4xx', async (t) => {
    const logs = recordLogs(t);

    await withApp({}, async (base) => {
      // express.json()'s default limit is 100kb, which body-parser reads as
      // 102,400 bytes.
      const oversized = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: PASSWORD,
          padding: 'x'.repeat(102_400),
        }),
      });
      assert.equal(oversized.status, 413);
      assert.deepEqual(await oversized.json(), { error: 'Invalid request' });

      const charset = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=klingon' },
        body: JSON.stringify({ password: PASSWORD }),
      });
      assert.equal(charset.status, 415);
      assert.deepEqual(await charset.json(), { error: 'Invalid request' });
    });

    assert.deepEqual(logs, []);
  });
});
