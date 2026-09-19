import type { Server } from 'node:http';
import type { Express } from 'express';
import type { Logger } from './logger.ts';

export interface ListenDeps {
  logger: Logger;
  // Runs once when the port cannot be bound, after the failure is logged.
  onError: (error: Error) => void;
}

// Express 5 hands app.listen's callback the error when binding fails —
// EADDRINUSE, say — and calls it with none once the server is listening.
// Express 4's callback ran only on success, so code written for it logs
// "listening" for a server that never started.
export function listen(app: Express, port: number, deps: ListenDeps): Server {
  return app.listen(port, (error) => {
    if (error) {
      deps.logger.error('Could not start the HTTP server', error.message);
      deps.onError(error);
      return;
    }
    deps.logger.info(`server listening on http://127.0.0.1:${port}`);
  });
}
