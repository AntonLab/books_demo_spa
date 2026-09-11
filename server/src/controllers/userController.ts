import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { verifyPassword } from '../password.ts';
import { clearSessionCookie } from '../sessionCookie.ts';
import { AppError, ForbiddenError, NotFoundError } from '../types/errors.ts';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from '../types/user.ts';
import type { UserRole } from '../types/permission.ts';

// The accounts an admin manages besides their own. Everything above them —
// other admins, every superadmin — is a superadmin's call. See CONTEXT.md.
const ADMIN_MANAGEABLE_ROLES: readonly UserRole[] = ['user', 'author'];

export interface UserController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createUserController(
  repository: UserRepository
): UserController {
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
    if (req.permissionScope !== 'any') {
      if (req.user?.id !== id) {
        throw new ForbiddenError('You may only change your own account');
      }
      return;
    }

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
    currentPassword: string | undefined
  ): Promise<void> => {
    if (currentPassword === undefined) {
      throw new AppError(
        'currentPassword is required to change your password or email',
        400
      );
    }

    const hash = await repository.findPasswordHashById(id);
    if (hash === null || !(await verifyPassword(hash, currentPassword))) {
      throw new ForbiddenError('Current password is incorrect');
    }
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
        await assertCurrentPassword(id, currentPassword);
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
  };
}
