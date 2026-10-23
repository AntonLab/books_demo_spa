import type { Request, RequestHandler, Response } from 'express';
import { processAvatarImage } from '../images.ts';
import { refusal } from '../middleware/authRateLimit.ts';
import type { RateLimiter } from '../rateLimit.ts';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { verifyPassword } from '../password.ts';
import { clearSessionCookie } from '../sessionCookie.ts';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
} from '../types/errors.ts';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateRoleInput,
  UpdateUserInput,
} from '../types/user.ts';
import { REGISTRABLE_ROLES, type UserRole } from 'shared';

// The accounts an admin manages besides their own. Everything above them —
// other admins, every superadmin — is a superadmin's call. See CONTEXT.md.
const ADMIN_MANAGEABLE_ROLES: readonly UserRole[] = ['user', 'author'];

// The non-`any` half of assertMayTouch, also mounted ahead of the upload
// limiter so a refused PUT spends no budget. No database read.
export function assertOwnRow(req: Request, id: number): void {
  if (req.permissionScope !== 'any' && req.user?.id !== id) {
    throw new ForbiddenError('You may only change your own account');
  }
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createUserController(
  repository: UserRepository,
  currentPasswordLimiter: RateLimiter
) {
  // The other half of enforcement. requirePermission already refused `none`.
  //
  // Anything but `any` — `own`, or a handler mounted without
  // requirePermission — reaches only the caller's own row, compared without
  // touching the database, so a refusal leaks nothing about which ids exist.
  //
  // `any` reaches other accounts, so the target has to be loaded to learn its
  // rank: 404 before 403, as everywhere else. Only a superadmin reaches
  // admin and superadmin accounts other than their own.
  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    assertOwnRow(req, id);
    if (req.permissionScope !== 'any') return;

    const target = await repository.findById(id);
    if (!target) throw new NotFoundError('User', id);

    const isOwnRow = req.user?.id === id;
    if (
      req.user?.role !== 'superadmin' &&
      !isOwnRow &&
      !ADMIN_MANAGEABLE_ROLES.includes(target.role)
    ) {
      throw new ForbiddenError(
        'Only a superadmin may manage admin and superadmin accounts'
      );
    }
  };

  // A session alone does not prove who is at the keyboard: a script injected
  // into the page could send this request with the cookie attached. Asking
  // for the current password is what stops it taking the account over in one
  // request.
  const assertCurrentPassword = async (
    id: number,
    currentPassword: string | undefined,
    res: Response
  ): Promise<void> => {
    if (currentPassword === undefined) {
      throw new AppError(
        'currentPassword is required to change your password or email',
        400
      );
    }

    // Charged on arrival so parallel guesses cannot share a slot, as in
    // limitFailedLogins.
    const budget = currentPasswordLimiter.hit(String(id));
    if (!budget.allowed) throw refusal(res, budget.retryAfterMs);

    const hash = await repository.findPasswordHashById(id);
    if (hash === null || !(await verifyPassword(hash, currentPassword))) {
      throw new ForbiddenError('Current password is incorrect');
    }
    currentPasswordLimiter.reset(String(id));
  };

  return {
    create: async (req, res) => {
      const user = await repository.create(validatedBody<CreateUserInput>(req));
      res.status(201).json(user);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListUsersQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const user = await repository.findById(id);
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      // currentPassword is proof, not a change: checked here, never stored.
      const { currentPassword, ...changes } =
        validatedBody<UpdateUserInput>(req);
      const isOwnRow = req.user?.id === id;

      // Nobody unblocks, activates or locks themselves out: a status is
      // always somebody else's decision.
      if (isOwnRow && changes.status !== undefined) {
        throw new ForbiddenError('You may not change your own status');
      }

      if (
        isOwnRow &&
        (changes.password !== undefined || changes.email !== undefined)
      ) {
        await assertCurrentPassword(id, currentPassword, res);
      }

      const user = await repository.update(id, changes);
      if (!user) throw new NotFoundError('User', id);

      // The repository has just ended every session this account had, the one
      // carrying this request included; clearing the cookie keeps the browser
      // from presenting a token that names nothing.
      if (isOwnRow && changes.password !== undefined) {
        clearSessionCookie(res);
      }

      res.json(user);
    },

    updateRole: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      const { id } = validatedParams<{ id: number }>(req);
      const { role } = validatedBody<UpdateRoleInput>(req);

      const isSuperadmin = req.user.role === 'superadmin';
      const isOwnRow = req.user.id === id;
      const isSelfServiceRole = (
        REGISTRABLE_ROLES as readonly string[]
      ).includes(role);

      // A superadmin's own role is another superadmin's call. Stepping down
      // would otherwise be one request away from the self-deletion they may
      // not make — and the last superadmin stepping down strands the system.
      if (isSuperadmin && isOwnRow) {
        throw new ForbiddenError('A superadmin may not change their own role');
      }

      // Switching between user and author is a statement of intent, not a
      // privilege — the real protection is that an author may only touch their
      // own rows. Everything above that is superadmin's alone.
      if (!isSuperadmin && !(isOwnRow && isSelfServiceRole)) {
        throw new ForbiddenError('You may not set that role');
      }

      const user = await repository.updateRole(id, role);
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      // The top role does not remove itself: the last superadmin gone would
      // leave nobody able to manage admins. Another superadmin still can.
      if (req.user?.id === id && req.user.role === 'superadmin') {
        throw new ForbiddenError(
          'A superadmin may not delete their own account'
        );
      }

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('User', id);
      res.status(204).end();
    },

    // Users x update, then the same rank check PATCH uses.
    uploadAvatar: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      if (!Buffer.isBuffer(req.body)) {
        throw new UnsupportedMediaTypeError();
      }
      await assertMayTouch(req, id);

      const processed = await processAvatarImage(req.body);
      const found = await repository.setAvatar(id, processed);
      if (!found) throw new NotFoundError('User', id);

      const user = await repository.findById(id);
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    },

    // Same guards as uploadAvatar; 204 whether or not an Avatar existed.
    removeAvatar: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      await repository.removeAvatar(id);
      res.status(204).end();
    },

    // Fully public — mounted with no permission middleware at all, not
    // even users x read, which a guest lacks.
    getAvatar: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const avatar = await repository.getAvatarData(id);
      if (!avatar) throw new NotFoundError('User', id);

      res
        .status(200)
        .set({
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=31536000, immutable',
        })
        .send(avatar.data);
    },
  } satisfies Record<string, RequestHandler>;
}
