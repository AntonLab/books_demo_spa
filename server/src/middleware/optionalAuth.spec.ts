import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createOptionalAuth } from './optionalAuth.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { hashToken } from '../tokens.ts';
import type { PublicUser } from '../types/user.ts';

const USER: PublicUser = {
  id: 7,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const TOKEN = 'valid-token';

function deps() {
  return {
    sessionRepository: {
      async findValidByTokenHash(tokenHash: string) {
        return tokenHash === hashToken(TOKEN)
          ? { id: 1, userId: USER.id, expiresAt: new Date(Date.now() + 60_000) }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findById(id: number) {
        return id === USER.id ? USER : null;
      },
    } as UserRepository,
  };
}

function runWith(cookies: Record<string, string>): Promise<Request> {
  const req = { cookies } as unknown as Request;

  return new Promise<Request>((resolve, reject) => {
    void createOptionalAuth(deps())(req, {} as Response, (err?: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(req);
    });
  });
}

test('optionalAuth sets req.user for a valid session', async () => {
  const req = await runWith({ sid: TOKEN });

  assert.equal(req.user?.id, USER.id);
});

test('optionalAuth passes an anonymous request through', async () => {
  const req = await runWith({});

  assert.equal(req.user, undefined);
});

test('optionalAuth passes an unknown token through without erroring', async () => {
  const req = await runWith({ sid: 'nonsense' });

  assert.equal(req.user, undefined);
});
