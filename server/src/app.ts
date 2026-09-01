import express, { type Express } from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import type { UserRepository } from './repositories/userRepository.ts';
import { createApiRouter } from './routes/index.ts';

export interface AppDeps {
  userRepository: UserRepository;
}

// No listen() here: tests bind an ephemeral port themselves.
export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(express.json());
  app.use('/api', createApiRouter(deps));
  app.use(notFound);
  // Must stay last, after every route and middleware.
  app.use(errorHandler);

  return app;
}
