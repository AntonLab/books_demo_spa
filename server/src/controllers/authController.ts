import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import type { ResetDelivery } from '../delivery/resetDelivery.ts';
import { validatedBody } from '../middleware/validate.ts';
import { hashPassword, verifyPassword } from '../password.ts';
import type { PasswordResetRepository } from '../repositories/passwordResetRepository.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import {
  clearSessionCookie,
  setSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from '../sessionCookie.ts';
import { createToken, hashToken } from '../tokens.ts';
import type {
  LoginInput,
  RegisterInput,
  ResetConfirmInput,
  ResetRequestInput,
} from '../types/auth.ts';
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
} from '../types/errors.ts';

export interface AuthControllerDeps {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  passwordResetRepository: PasswordResetRepository;
  resetDelivery: ResetDelivery;
  // Injectable purely so a test can prove the unknown-login path still spends
  // an argon2 verify. A wall-clock assertion would be flaky under load, and an
  // ESM import binding cannot be spied on from outside; this makes the timing
  // defence observable instead of merely asserted in a comment.
  verify?: (hashed: string, plaintext: string) => Promise<boolean>;
}

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
  requestReset: RequestHandler;
  confirmReset: RequestHandler;
}

// One hour, far shorter than a session's seven days: a reset link sits in a
// mailbox, which is a much likelier place to leak from than a cookie jar.
const RESET_TTL_MS = 60 * 60 * 1000;

// Computed lazily and cached, not hardcoded: hashPassword reads the argon2
// parameters from NODE_ENV, so tests get the deliberately weak settings and
// production gets the real ones. Verifying against this on an unknown login
// keeps the response time indistinguishable from a wrong password.
let dummyHash: Promise<string> | undefined;
function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

export function createAuthController(deps: AuthControllerDeps): AuthController {
  const verify = deps.verify ?? verifyPassword;

  async function openSession(userId: number): Promise<string> {
    const token = createToken();
    await deps.sessionRepository.create(
      userId,
      hashToken(token),
      new Date(Date.now() + SESSION_TTL_MS)
    );
    return token;
  }

  return {
    register: async (req, res) => {
      const input = validatedBody<RegisterInput>(req);
      // status is set here, not accepted from the body: the column defaults to
      // 'pending' and there is no verification flow to clear it, so a
      // registrant would otherwise be unable to log in.
      const user = await deps.userRepository.create({
        ...input,
        status: 'active',
      });

      setSessionCookie(res, await openSession(user.id));
      res.status(201).json(user);
    },

    login: async (req, res) => {
      const { login, password } = validatedBody<LoginInput>(req);
      const credential =
        await deps.userRepository.findByLoginWithPassword(login);

      if (!credential) {
        // Burn the same argon2 cost a real verify would, so response timing
        // does not separate "no such user" from "wrong password".
        await verify(await dummyPasswordHash(), password);
        throw new UnauthorizedError('Invalid credentials');
      }

      if (!(await verify(credential.password, password))) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Checked after the password, not before: otherwise the 403 tells an
      // attacker without the password that the account exists.
      if (credential.status === 'blocked') {
        throw new ForbiddenError('Account is blocked');
      }

      const user = await deps.userRepository.findById(credential.id);
      if (!user) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // A fresh row every login; the previous cookie is replaced, never
      // reused. This is what rules out session fixation.
      setSessionCookie(res, await openSession(user.id));
      res.json(user);
    },

    logout: async (req, res) => {
      const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
      if (typeof token === 'string' && token.length > 0) {
        await deps.sessionRepository.deleteByTokenHash(hashToken(token));
      }

      // 204 either way: logging out twice, or with a stale cookie, is not a
      // client error and must not be reported as one.
      clearSessionCookie(res);
      res.status(204).end();
    },

    me: (req, res) => {
      // requireAuth guarantees this; the check narrows the optional type.
      if (!req.user) throw new UnauthorizedError();
      res.json(req.user);
    },

    requestReset: async (req, res) => {
      const { email } = validatedBody<ResetRequestInput>(req);
      const user = await deps.userRepository.findByEmail(email);

      if (user) {
        // Supersede any outstanding token: two live links for one account
        // widens the window a stolen one is useful in.
        await deps.passwordResetRepository.invalidateAllForUser(user.id);

        const token = createToken();
        await deps.passwordResetRepository.create(
          user.id,
          hashToken(token),
          new Date(Date.now() + RESET_TTL_MS)
        );
        await deps.resetDelivery.send(user.email, token);
      }

      // 202 whether or not the address exists. Branching the response here
      // would turn this endpoint into an account-enumeration oracle.
      res.status(202).end();
    },

    confirmReset: async (req, res) => {
      const { token, password } = validatedBody<ResetConfirmInput>(req);

      // One call, one transaction: the repository updates the password, stamps
      // the token used, and revokes every session together.
      const redeemed = await deps.passwordResetRepository.redeem(
        hashToken(token),
        password
      );
      if (!redeemed) {
        // Unknown, expired and already-used all land here with one message, so
        // the response never says which.
        //
        // AppError rather than ValidationError: ValidationError's constructor
        // takes `details`, not a message, so passing a string there would
        // produce {error: 'Request validation failed', details: '...'} — the
        // wrong shape for a failure that is not a schema violation.
        throw new AppError('Reset token is invalid or has expired', 400);
      }

      res.status(204).end();
    },
  };
}
