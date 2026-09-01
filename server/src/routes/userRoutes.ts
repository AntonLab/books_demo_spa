import { Router } from 'express';
import { createUserController } from '../controllers/userController.ts';
import { validate } from '../middleware/validate.ts';
import type { UserRepository } from '../repositories/userRepository.ts';
import {
  createUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../types/user.ts';

export function createUserRoutes(repository: UserRepository): Router {
  const controller = createUserController(repository);
  const router = Router();

  router.post('/', validate({ body: createUserSchema }), controller.create);
  router.get('/', validate({ query: listUsersQuerySchema }), controller.list);
  router.get('/:id', validate({ params: idParamSchema }), controller.getById);
  router.patch(
    '/:id',
    validate({ params: idParamSchema, body: updateUserSchema }),
    controller.update
  );
  router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

  return router;
}
