import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateBookInput,
  ListBooksQuery,
  UpdateBookInput,
} from '../types/book.ts';

export interface BookController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createBookController(
  repository: BookRepository
): BookController {
  return {
    create: async (req, res) => {
      const book = await repository.create(validatedBody<CreateBookInput>(req));
      res.status(201).json(book);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListBooksQuery>(req);
      const { items, total } = await repository.list(query);
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const book = await repository.findById(id);
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const book = await repository.update(
        id,
        validatedBody<UpdateBookInput>(req)
      );
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const deleted = await repository.remove(id);
      if (!deleted) throw new NotFoundError('Book', id);
      res.status(204).end();
    },
  };
}
