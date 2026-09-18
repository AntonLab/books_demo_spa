import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createRequirePermission } from './requirePermission.ts';
import { loadMatrix } from '../permissions/permissionStore.ts';
import { buildMatrixRows } from '../permissions/matrix.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { hashToken } from '../tokens.ts';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';
import type { PublicUser } from '../types/user.ts';
import type { UserRole } from '../types/permission.ts';

loadMatrix(buildMatrixRows());

const TOKEN = 'valid-token';

const userWithRole = (role: UserRole): PublicUser => ({
  id: 7,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role,
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

function deps(role: UserRole, status: PublicUser['status'] = 'active') {
  const user = { ...userWithRole(role), status };

  return {
    sessionRepository: {
      async findValidByTokenHash(tokenHash: string) {
        return tokenHash === hashToken(TOKEN)
          ? { id: 1, userId: user.id, expiresAt: new Date(Date.now() + 60_000) }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findById(id: number) {
        return id === user.id ? user : null;
      },
    } as UserRepository,
  };
}

function run(
  role: UserRole,
  cookies: Record<string, string>,
  module: Parameters<ReturnType<typeof createRequirePermission>>[0],
  action: Parameters<ReturnType<typeof createRequirePermission>>[1],
  status: PublicUser['status'] = 'active'
): Promise<{ req: Request; error: unknown }> {
  const req = { cookies } as unknown as Request;
  const handler = createRequirePermission(deps(role, status))(module, action);

  return new Promise((resolve) => {
    void handler(req, {} as Response, (error?: unknown) =>
      resolve({ req, error })
    );
  });
}

test('an anonymous caller reads the public catalogue as guest', async () => {
  const { error, req } = await run('user', {}, 'books', 'read');

  assert.equal(error, undefined);
  assert.equal(req.permissionScope, 'any');
  assert.equal(req.user, undefined);
});

test('an anonymous write is 401, not 403', async () => {
  // 401 says "identify yourself"; 403 says "identifying will not help". For a
  // caller with no session the first is the true answer.
  const { error } = await run('user', {}, 'books', 'create');

  assert.ok(error instanceof UnauthorizedError);
  assert.equal(error.statusCode, 401);
});

test('a signed-in caller whose role is refused gets 403', async () => {
  const { error } = await run('user', { sid: TOKEN }, 'books', 'create');

  assert.ok(error instanceof ForbiddenError);
  assert.equal(error.statusCode, 403);
});

test('an author may create a book and the scope reaches the handler', async () => {
  const { error, req } = await run('author', { sid: TOKEN }, 'books', 'create');

  assert.equal(error, undefined);
  assert.equal(req.permissionScope, 'own');
  assert.equal(req.user?.role, 'author');
});

test('an admin gets `any`, which is what lets the controller skip the owner check', async () => {
  const { error, req } = await run('admin', { sid: TOKEN }, 'books', 'update');

  assert.equal(error, undefined);
  assert.equal(req.permissionScope, 'any');
});

test('an admin may not create a book', async () => {
  const { error } = await run('admin', { sid: TOKEN }, 'books', 'create');

  assert.ok(error instanceof ForbiddenError);
});

test('a blocked account is served as a guest', async () => {
  const read = await run('user', { sid: TOKEN }, 'books', 'read', 'blocked');
  assert.equal(read.error, undefined);
  assert.equal(read.req.permissionScope, 'any');
  assert.equal(read.req.user, undefined);

  const write = await run('user', { sid: TOKEN }, 'books', 'create', 'blocked');
  assert.ok(write.error instanceof UnauthorizedError);
  assert.equal((write.error as UnauthorizedError).statusCode, 401);
});
