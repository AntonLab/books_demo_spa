import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import { createApp, type AppDeps } from '../app.ts';
import type { AuthRateLimits } from '../middleware/authRateLimit.ts';
import {
  XSRF_COOKIE_NAME,
  XSRF_HEADER_NAME,
  xsrfTokenFor,
} from '../middleware/csrfProtection.ts';
import type { RateLimiter } from '../rateLimit.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import type { UserRole } from '../types/permission.ts';
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
    findDetailById: unreachable,
    update: unreachable,
    remove: unreachable,
    restore: unreachable,
    markRead: unreachable,
    // The auth-era methods. The stub is built from a fixed key list and cast,
    // so a method missing here is a runtime "not a function" rather than a
    // compile error — every repository method any route can reach must appear.
    createIfCredentialCurrent: unreachable,
    findValidByTokenHash: unreachable,
    deleteByTokenHash: unreachable,
    deleteAllForUser: unreachable,
    invalidateAllForUser: unreachable,
    redeem: unreachable,
    findByLoginWithPassword: unreachable,
    listAuthors: unreachable,
    findByEmail: unreachable,
    findPasswordHashById: unreachable,
    // The expiry purge's. Unreachable from any route, like the rest.
    deleteExpired: unreachable,
    deleteExpiredBefore: unreachable,
  } as T;
}

// Never refuses: the route specs sign in far more often than the real limits
// allow. Those limits have their own specs — middleware/authRateLimit.spec.ts,
// and the rate-limit cases in authRoutes.spec.ts, which pass
// createAuthRateLimits() instead.
export function unlimitedAuthRateLimits(): AuthRateLimits {
  const unlimited = (): RateLimiter => ({
    hit: () => ({ allowed: true, retryAfterMs: 0 }),
    peek: () => ({ allowed: true, retryAfterMs: 0 }),
    release: () => {},
    reset: () => {},
    size: () => 0,
    stop: () => {},
  });
  return {
    loginByIpAndLogin: unlimited(),
    loginByIp: unlimited(),
    register: unlimited(),
    resetRequest: unlimited(),
    stop: () => {},
  };
}

// Every repository an unreachable stub. Exported for createApp.spec.ts, which
// listens on createApp's own app rather than through withApp's wrapper.
export function defaultDeps(): AppDeps {
  return {
    userRepository: createUnusedRepository('user'),
    seriesRepository: createUnusedRepository('series'),
    bookRepository: createUnusedRepository('book'),
    chapterRepository: createUnusedRepository('chapter'),
    commentRepository: createUnusedRepository('comment'),
    likeRepository: createUnusedRepository('like'),
    notificationRepository: createUnusedRepository('notification'),
    sessionRepository: createUnusedRepository('session'),
    passwordResetRepository: createUnusedRepository('passwordReset'),
    resetDelivery: {
      send: () => {
        throw new Error('reset delivery must not be used by these tests');
      },
    },
    trustedOrigin: 'http://localhost:3000',
    trustProxy: 0,
    authRateLimits: unlimitedAuthRateLimits(),
  };
}

// The route specs are about routes, so every request they send with a session
// cookie is given that session's XSRF token, the way the client's request()
// sends it. The refusals themselves are covered in
// middleware/csrfProtection.spec.ts.
const withXsrfToken: RequestHandler = (req, _res, next) => {
  const cookie = req.headers.cookie ?? '';
  const session = cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`)
  )?.[1];
  if (session && req.headers[XSRF_HEADER_NAME] === undefined) {
    const token = xsrfTokenFor(session);
    req.headers.cookie = `${cookie}; ${XSRF_COOKIE_NAME}=${token}`;
    req.headers[XSRF_HEADER_NAME] = token;
  }
  next();
};

// Binds an ephemeral port so suites can run in parallel without collisions.
export async function withApp(
  overrides: Partial<AppDeps>,
  fn: (base: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(withXsrfToken);
  app.use(createApp({ ...defaultDeps(), ...overrides }));
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
  role: 'user',
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// A second identity for every role, plus one extra: `otherAuthor` is not a
// role the matrix knows about, it is a second *author* with its own id, kept
// distinct from `author` so a spec can prove one author cannot touch another
// author's rows. Every persona below is reachable within one running app
// instance, which is what lets a single test drive two identities — an
// author creating a row, then a different persona acting on it.
type TestPersona = UserRole | 'otherAuthor';

const PERSONA_TOKENS: Record<TestPersona, string> = {
  user: 'token-user',
  author: 'token-author',
  admin: 'token-admin',
  superadmin: 'token-superadmin',
  otherAuthor: 'token-other-author',
};

// One cookie per persona, so a spec can say who is calling without building a
// session repository of its own.
export const ROLE_COOKIES: Record<TestPersona, string> = {
  user: `${SESSION_COOKIE_NAME}=${PERSONA_TOKENS.user}`,
  author: `${SESSION_COOKIE_NAME}=${PERSONA_TOKENS.author}`,
  admin: `${SESSION_COOKIE_NAME}=${PERSONA_TOKENS.admin}`,
  superadmin: `${SESSION_COOKIE_NAME}=${PERSONA_TOKENS.superadmin}`,
  otherAuthor: `${SESSION_COOKIE_NAME}=${PERSONA_TOKENS.otherAuthor}`,
};

// Distinct per persona, `user` and `author` included — userRepository.findById
// is keyed by id, so two personas sharing one would make the session resolve
// to whichever was registered last rather than to the caller who sent it.
export const USER_IDS: Record<TestPersona, number> = {
  user: TEST_USER.id,
  author: 2,
  admin: 3,
  superadmin: 4,
  otherAuthor: 5,
};

const PERSONA_ROLES: Record<TestPersona, UserRole> = {
  user: 'user',
  author: 'author',
  admin: 'admin',
  superadmin: 'superadmin',
  // A second author, not a fifth role: the matrix has no idea `otherAuthor`
  // exists.
  otherAuthor: 'author',
};

// `user` resolves to TEST_USER itself rather than a look-alike: specs outside
// this file assert response fields against TEST_USER directly (its login,
// its id), and AUTH_COOKIE has to reach the very same object for those to
// hold.
function personaUser(persona: TestPersona): PublicUser {
  if (persona === 'user') return TEST_USER;

  return {
    ...TEST_USER,
    id: USER_IDS[persona],
    login: persona,
    role: PERSONA_ROLES[persona],
  };
}

const PERSONAS = Object.keys(PERSONA_TOKENS) as TestPersona[];

const USERS_BY_ID = new Map<number, PublicUser>(
  PERSONAS.map((persona) => [USER_IDS[persona], personaUser(persona)])
);

const USERS_BY_TOKEN_HASH = new Map<string, PublicUser>(
  PERSONAS.map((persona) => [
    hashToken(PERSONA_TOKENS[persona]),
    personaUser(persona),
  ])
);

// Kept as an alias of ROLE_COOKIES.user, which resolves to TEST_USER, so the
// specs that only know one identity keep compiling and passing unchanged.
export const AUTH_COOKIE = ROLE_COOKIES.user;

// Minimal stand-ins for the two repositories requireAuth/requirePermission
// consult. Every persona's token and id are known at once, which is what lets
// a spec drive two identities — an author creating a row, then otherAuthor or
// admin acting on it — against a single running app instance.
function authStubs(): Pick<AppDeps, 'sessionRepository' | 'userRepository'> {
  return {
    sessionRepository: {
      async findValidByTokenHash(tokenHash: string) {
        const user = USERS_BY_TOKEN_HASH.get(tokenHash);
        return user
          ? {
              id: user.id,
              userId: user.id,
              expiresAt: new Date(Date.now() + 60_000),
            }
          : null;
      },
    } as SessionRepository,
    userRepository: {
      async findById(id: number) {
        return USERS_BY_ID.get(id) ?? null;
      },
    } as UserRepository,
  };
}

// Use for guarded requests; pair with ROLE_COOKIES (or AUTH_COOKIE for the
// plain-user persona). `withApp` stays the unauthenticated harness, so a
// spec's 401 tests keep working unchanged.
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
      // The users and authors specs override userRepository, and
      // requirePermission shares it: resolving the session's user would
      // otherwise go through that spec's own fake, which has never heard of
      // these personas and answers null — a 401 on every guarded request
      // before the fake is even reached. The override answers first, so a
      // spec's GET /:id keeps its own rows, and the known personas are the
      // fallback that lets the session resolve.
      userRepository: overrideUsers
        ? {
            ...overrideUsers,
            async findById(id: number) {
              return (
                (await overrideUsers.findById(id)) ??
                USERS_BY_ID.get(id) ??
                null
              );
            },
          }
        : stubs.userRepository,
    },
    fn
  );
}
