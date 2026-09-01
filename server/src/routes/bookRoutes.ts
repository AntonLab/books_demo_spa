import { Router } from 'express';
import { createBookController } from '../controllers/bookController.ts';
import { validate } from '../middleware/validate.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import {
  createBookSchema,
  idParamSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from '../types/book.ts';

export function createBookRoutes(repository: BookRepository): Router {
  const controller = createBookController(repository);
  const router = Router();

  router.post('/', validate({ body: createBookSchema }), controller.create);
  router.get('/', validate({ query: listBooksQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);
  router.patch(
    '/:id',
    validate({ params: idParamSchema, body: updateBookSchema }),
    controller.update
  );
  router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

  return router;
}
