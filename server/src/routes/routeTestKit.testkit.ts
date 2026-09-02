import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../app.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import type { PublicUser } from '../types/user.ts';

// The five route specs each drive one resource; createApp still requires the
// others. Stubs that throw keep that assumption honest rather than silently
// returning undefined.
export function createUnusedRepository<T>(name: string): T {
  const unreachable = (): never => {
    throw new Error(`the ${name} repository must not be used by these tests`);
  };

  return {
    create: unreachable,
    list: unreachable,
    findById: unreachable,
    update: unreachable,
    remove: unreachable,
    // The auth-era methods. The stub is built from a fixed key list and cast,
    // so a method missing here is a runtime "not a function" rather than a
    // compile error — every repository method any route can reach must appear.
    findValidByTokenHash: unreachable,
    deleteByTokenHash: unreachable,
    deleteAllForUser: unreachable,
    invalidateAllForUser: unreachable,
    redeem: unreachable,
    findByLoginWithPassword: unreachable,
    findByEmail: unreachable,
  } as T;
}

function defaultDeps(): AppDeps {
  return {
    userRepository: createUnusedRepository('user'),
    seriesRepository: createUnusedRepository('series'),
    bookRepository: createUnusedRepository('book'),
    chapterRepository: createUnusedRepository('chapter'),
    likeRepository: createUnusedRepository('like'),
    sessionRepository: createUnusedRepository('session'),
    passwordResetRepository: createUnusedRepository('passwordReset'),
    resetDelivery: {
      send: () => {
        throw new Error('reset delivery must not be used by these tests');
      },
    },
  };
}

// Binds an ephemeral port so suites can run in parallel without collisions.
export async function withApp(
  overrides: Partial<AppDeps>,
  fn: (base: string) => Promise<void>
): Promise<void> {
  const app = createApp({ ...defaultDeps(), ...overrides });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// undici's Body.json() returns Promise<unknown>; this is the single place the
// tests narrow it, mirroring validatedBody/Query/Params in validate.ts.
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export const TEST_USER: PublicUser = {
  id: 1,
  login: 'TestUser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const TEST_TOKEN = 'test-session-token';

// The cookie header every guarded request in the five resource specs sends.
export const AUTH_COOKIE = `${SESSION_COOKIE_NAME}=${TEST_TOKEN}`;

// Minimal stand-ins for the two repositories requireAuth consults. They accept
// exactly one token and know exactly one user, which is all these suites need.
function authStubs(): Pick<AppDeps, 'sessionRepository' | 'userRepository'> {
  return {
    sessionRepository: {
      async findValidByTokenHash(tokenHash: string) {
        return tokenHash === hashToken(TEST_TOKEN)
          ? {
              id: 1,
              userId: TEST_USER.id,
              expiresAt: new Date(Date.now() + 60_000),
            }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findById(id: number) {
        return id === TEST_USER.id ? TEST_USER : null;
      },
    } as UserRepository,
  };
}

// Use for guarded requests; pair with AUTH_COOKIE. `withApp` stays the
// unauthenticated harness, so a spec's 401 tests keep working unchanged.
export async function withAuthenticatedApp(
  overrides: Partial<AppDeps>,
  fn: (base: string) => Promise<void>
): Promise<void> {
  const stubs = authStubs();
  const overrideUsers = overrides.userRepository;

  await withApp(
    {
      ...stubs,
      ...overrides,
      // Only userRoutes.spec overrides userRepository, and requireAuth shares
      // it: resolving the session's user would otherwise go through that
      // spec's own fake, which has never heard of TEST_USER and answers null
      // — a 401 on every guarded request before the fake is even reached.
      // The override answers first, so that spec's GET /:id keeps its own
      // rows, and TEST_USER is the fallback that lets the session resolve.
      userRepository: overrideUsers
        ? {
            ...overrideUsers,
            async findById(id: number) {
              return (
                (await overrideUsers.findById(id)) ??
                (id === TEST_USER.id ? TEST_USER : null)
              );
            },
          }
        : stubs.userRepository,
    },
    fn
  );
}
