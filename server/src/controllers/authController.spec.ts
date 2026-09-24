import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createAuthController } from './authController.ts';
import type { ResetDelivery } from '../delivery/resetDelivery.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type {
  SessionOpening,
  SessionRecord,
  SessionRepository,
} from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';
import type { PublicUser, UserStatus } from '../types/user.ts';

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
const noDelivery = {} as ResetDelivery;

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
    resetDelivery: noDelivery,
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
    resetDelivery: noDelivery,
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

  const publicUser = (): PublicUser => ({
    id: account.id,
    login: 'Racer',
    email: 'racer@example.com',
    firstName: 'Race',
    lastName: 'Er',
    status: account.status,
    role: 'user',
    avatarUrl: null,
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

  return { account, opened, userRepository, sessionRepository };
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
    resetDelivery: noDelivery,
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
  assert.deepEqual(cookies, []);
});
