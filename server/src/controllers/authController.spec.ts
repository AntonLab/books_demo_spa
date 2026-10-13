import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createAuthController } from './authController.ts';
import type { MailDelivery, MailMessage } from '../delivery/mailDelivery.ts';
import { flushDetached } from '../flush.testkit.ts';
import { recordLogs } from '../logger.testkit.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type {
  SessionOpening,
  SessionRecord,
  SessionRepository,
} from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';
import type { PublicUser, UserStatus } from 'shared';

function loginRequest(login: string, password: string): Request {
  return {
    validated: { body: { login, password } },
    cookies: {},
  } as unknown as Request;
}

const unusedResponse = {} as Response;
const noSessions = {} as SessionRepository;
// The reset collaborators are required by AuthControllerDeps but unreachable
// from login; an empty stub fails loudly if that ever stops being true.
const noResets = {} as PasswordResetRepository;
const noMail = {} as MailDelivery;

test('an unknown login still spends a password verify, so timing cannot separate it from a wrong one', async () => {
  const verified: string[] = [];

  const controller = createAuthController({
    userRepository: {
      async findByLoginWithPassword() {
        return null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    passwordResetRepository: noResets,
    mailDelivery: noMail,
    appBaseUrl: 'http://localhost:3000',
    verify: async (hashed) => {
      verified.push(hashed);
      return false;
    },
  });

  await assert.rejects(
    async () =>
      controller.login(loginRequest('Nobody', 'whatever12345'), unusedResponse),
    /Invalid credentials/
  );

  // Exactly one verify, against a hash that belongs to no user.
  assert.equal(verified.length, 1);
  assert.match(verified[0] ?? '', /^\$argon2id\$/);
});

test('the dummy hash is reused rather than recomputed per attempt', async () => {
  const verified: string[] = [];

  const controller = createAuthController({
    userRepository: {
      async findByLoginWithPassword() {
        return null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    passwordResetRepository: noResets,
    mailDelivery: noMail,
    appBaseUrl: 'http://localhost:3000',
    verify: async (hashed) => {
      verified.push(hashed);
      return false;
    },
  });

  const attempt = () =>
    assert.rejects(async () =>
      controller.login(loginRequest('Nobody', 'whatever12345'), unusedResponse)
    );
  await attempt();
  await attempt();

  assert.equal(verified[0], verified[1]);
});

test('a value with @ is looked up by email only, and one without by login only', async () => {
  const calls: string[] = [];
  const controller = createAuthController({
    userRepository: {
      async findByLoginWithPassword(login: string) {
        calls.push(`login:${login}`);
        return null;
      },
      async findByEmailWithPassword(email: string) {
        calls.push(`email:${email}`);
        return null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    passwordResetRepository: noResets,
    mailDelivery: noMail,
    appBaseUrl: 'http://localhost:3000',
    verify: async () => false,
  });

  for (const value of ['bob@example.com', 'Bob']) {
    await assert.rejects(
      async () =>
        controller.login(loginRequest(value, 'whatever12345'), unusedResponse),
      /Invalid credentials/
    );
  }

  assert.deepEqual(calls, ['email:bob@example.com', 'login:Bob']);
});

test('an unknown email still spends a password verify against the dummy hash', async () => {
  const verified: string[] = [];
  const controller = createAuthController({
    userRepository: {
      async findByEmailWithPassword() {
        return null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    passwordResetRepository: noResets,
    mailDelivery: noMail,
    appBaseUrl: 'http://localhost:3000',
    verify: async (hashed) => {
      verified.push(hashed);
      return false;
    },
  });

  await assert.rejects(
    async () =>
      controller.login(
        loginRequest('nobody@example.com', 'whatever12345'),
        unusedResponse
      ),
    /Invalid credentials/
  );

  assert.equal(verified.length, 1);
  assert.match(verified[0] ?? '', /^\$argon2id\$/);
});

// One account behind both repositories login reads it through. The session
// fake re-reads the stored hash and status at the moment it opens a session,
// the way the real repository's locking read does, so a change made during the
// verify is seen. Its plain create() stands in for opening a session without
// that re-check, which is what login used to do.
function accountDeps() {
  const account: { id: number; password: string; status: UserStatus } = {
    id: 7,
    password: '$argon2id$stored',
    status: 'active',
  };
  const opened: string[] = [];
  const touched: number[] = [];

  const publicUser = (): PublicUser => ({
    id: account.id,
    login: 'Racer',
    email: 'racer@example.com',
    firstName: 'Race',
    lastName: 'Er',
    status: account.status,
    role: 'user',
    avatarUrl: null,
    about: '',
    showLastSeen: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

  const userRepository = {
    async findByLoginWithPassword() {
      return { ...account };
    },
    async findById(id: number) {
      return id === account.id ? publicUser() : null;
    },
    async touchLastSeen(id: number) {
      touched.push(id);
    },
  } as unknown as UserRepository;

  const sessionRepository = {
    async create(
      userId: number,
      tokenHash: string,
      expiresAt: Date
    ): Promise<SessionRecord> {
      opened.push(tokenHash);
      return { id: opened.length, userId, expiresAt };
    },
    async createIfCredentialCurrent(
      userId: number,
      tokenHash: string,
      _expiresAt: Date,
      verifiedPasswordHash: string
    ): Promise<SessionOpening> {
      if (userId !== account.id || account.password !== verifiedPasswordHash) {
        return 'credential-changed';
      }
      if (account.status === 'blocked') return 'blocked';
      opened.push(tokenHash);
      return 'created';
    },
  } as unknown as SessionRepository;

  return { account, opened, touched, userRepository, sessionRepository };
}

function recordingResponse() {
  const cookies: string[] = [];
  const response = {
    cookie(name: string) {
      cookies.push(name);
      return response;
    },
    json() {
      return response;
    },
  } as unknown as Response;
  return { response, cookies };
}

function loginController(
  deps: ReturnType<typeof accountDeps>,
  verify: () => Promise<boolean>
) {
  return createAuthController({
    userRepository: deps.userRepository,
    sessionRepository: deps.sessionRepository,
    passwordResetRepository: noResets,
    mailDelivery: noMail,
    appBaseUrl: 'http://localhost:3000',
    verify,
  });
}

test('a login whose account is unchanged since the verify opens its session', async () => {
  const deps = accountDeps();
  const { response, cookies } = recordingResponse();

  await loginController(deps, async () => true).login(
    loginRequest('Racer', 'whatever12345'),
    response
  );

  assert.equal(deps.opened.length, 1);
  assert.deepEqual(deps.touched, [7]);
  // The session and the XSRF token derived from it are handed out together.
  assert.deepEqual(cookies, ['sid', 'xsrfToken']);
});

test('a password change that lands during the verify leaves the login without a session', async () => {
  const deps = accountDeps();
  const { response, cookies } = recordingResponse();

  // The change commits while argon2 is still working on the old hash.
  const controller = loginController(deps, async () => {
    deps.account.password = '$argon2id$changed';
    return true;
  });

  await assert.rejects(
    async () =>
      controller.login(loginRequest('Racer', 'whatever12345'), response),
    (error: unknown) =>
      error instanceof UnauthorizedError &&
      error.statusCode === 401 &&
      error.message === 'Invalid credentials'
  );
  assert.deepEqual(deps.opened, []);
  assert.deepEqual(deps.touched, []);
  assert.deepEqual(cookies, []);
});

test('a block that lands during the verify leaves the login without a session', async () => {
  const deps = accountDeps();
  const { response, cookies } = recordingResponse();

  const controller = loginController(deps, async () => {
    deps.account.status = 'blocked';
    return true;
  });

  await assert.rejects(
    async () =>
      controller.login(loginRequest('Racer', 'whatever12345'), response),
    (error: unknown) =>
      error instanceof ForbiddenError &&
      error.statusCode === 403 &&
      error.message === 'Account is blocked'
  );
  assert.deepEqual(deps.opened, []);
  assert.deepEqual(deps.touched, []);
  assert.deepEqual(cookies, []);
});

function resetController(
  events: string[],
  overrides: { createFails?: boolean; lookupFails?: boolean } = {}
) {
  const known = { id: 7, email: 'racer@example.com' };
  return createAuthController({
    userRepository: {
      async findByEmail(email: string) {
        events.push('lookup');
        // MySQL data errors quote the offending value, the address included
        if (overrides.lookupFails) {
          throw new Error(
            `Incorrect string value for column 'email': '${email}'`
          );
        }
        return email === known.email ? known : null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    passwordResetRepository: {
      async invalidateAllForUser() {
        events.push('invalidate');
        return 0;
      },
      async create() {
        events.push('create');
        if (overrides.createFails) throw new Error('write down');
      },
    } as unknown as PasswordResetRepository,
    mailDelivery: {
      async send(_message: MailMessage) {
        events.push('send');
      },
    },
    appBaseUrl: 'http://localhost:3000',
  });
}

function resetRequest(email: string): Request {
  return { validated: { body: { email } } } as unknown as Request;
}

function resetResponse(events: string[]) {
  const response = {
    status(code: number) {
      events.push(`status ${code}`);
      return response;
    },
    end() {
      events.push('end');
      return response;
    },
  } as unknown as Response;
  return response;
}

test('a reset request answers 202 before the lookup and the token work run', async () => {
  const events: string[] = [];
  const controller = resetController(events);

  await controller.requestReset(
    resetRequest('racer@example.com'),
    resetResponse(events)
  );
  assert.deepEqual(events, ['status 202', 'end']);

  await flushDetached();
  assert.deepEqual(events, [
    'status 202',
    'end',
    'lookup',
    'invalidate',
    'create',
    'send',
  ]);
});

test('a reset request for an unknown address still looks up after the 202 and does no token work', async () => {
  const events: string[] = [];
  const controller = resetController(events);

  await controller.requestReset(
    resetRequest('nobody@example.com'),
    resetResponse(events)
  );
  await flushDetached();

  assert.deepEqual(events, ['status 202', 'end', 'lookup']);
});

for (const [name, overrides] of [
  ['a token write', { createFails: true }],
  ['a lookup', { lookupFails: true }],
] as const) {
  test(`${name} that fails after the 202 is logged and changes nothing the caller saw`, async (t) => {
    const lines = recordLogs(t);
    const events: string[] = [];
    const controller = resetController(events, overrides);

    await controller.requestReset(
      resetRequest('racer@example.com'),
      resetResponse(events)
    );
    await flushDetached();

    assert.deepEqual(events.slice(0, 2), ['status 202', 'end']);
    assert.equal(events.includes('send'), false);
    assert.deepEqual(lines, [
      {
        level: 'error',
        message: 'Password reset request failed',
        meta: { error: 'Error' },
      },
    ]);
    assert.equal(JSON.stringify(lines).includes('racer@example.com'), false);
  });
}
