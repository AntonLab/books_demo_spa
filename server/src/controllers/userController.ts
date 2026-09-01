import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import { NotFoundError } from '../types/errors.ts';
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
      const user = await repository.update(
        id,
        validatedBody<UpdateUserInput>(req)
      );
      if (!user) throw new NotFoundError('User', id);
      res.json(user);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('User', id);
      res.status(204).end();
    },
  };
}
