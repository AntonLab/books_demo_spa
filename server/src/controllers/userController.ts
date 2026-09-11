import type { Request, RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from '../types/user.ts';

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
  // The other half of enforcement. requirePermission already refused `none`;
  // `any` needs nothing more, and `own` is the only case that has to compare
  // against the caller. Unlike the other resources, no repository lookup is
  // needed to find an owner: the row *is* the account, so its id is the
  // owner. That also means this never touches the database, so a refusal
  // here leaks nothing about which ids exist — there is nothing to probe.
  //
  // Only `any` returns early. Every other value, a missing scope included,
  // falls through to the comparison: a handler mounted without
  // requirePermission fails closed rather than acting as `any`.
  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope === 'any') return;

    if (req.user?.id !== id) {
      throw new ForbiddenError('You may only change your own account');
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

      const user = await repository.update(
        id,
        validatedBody<UpdateUserInput>(req)
      );
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('User', id);
      res.status(204).end();
    },
  };
}
