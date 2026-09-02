import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createAuthController } from './authController.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';

function loginRequest(login: string, password: string): Request {
  return {
    validated: { body: { login, password } },
    cookies: {},
  } as unknown as Request;
}

const unusedResponse = {} as Response;
const noSessions = {} as SessionRepository;

test('an unknown login still spends a password verify, so timing cannot separate it from a wrong one', async () => {
  const verified: string[] = [];

  const controller = createAuthController({
    userRepository: {
      async findByLoginWithPassword() {
        return null;
      },
    } as unknown as UserRepository,
    sessionRepository: noSessions,
    verify: async (hashed) => {
      verified.push(hashed);
      return false;
    },
  });

  await assert.rejects(
    async () =>
      controller.login(
        loginRequest('Nobody', 'whatever12345'),
        unusedResponse,
        () => {}
      ),
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
    verify: async (hashed) => {
      verified.push(hashed);
      return false;
    },
  });

  const attempt = () =>
    assert.rejects(async () =>
      controller.login(
        loginRequest('Nobody', 'whatever12345'),
        unusedResponse,
        () => {}
      )
    );
  await attempt();
  await attempt();

  assert.equal(verified[0], verified[1]);
});
