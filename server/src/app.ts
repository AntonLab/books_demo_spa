import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import {
  createCrossOriginProtection,
  requireXsrfToken,
} from './middleware/csrfProtection.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { createApiRouter, type RouteDeps } from './routes/index.ts';

// Stops a browser second-guessing a response's Content-Type: sniffing a JSON
// error or an uploaded image as HTML is how a stored payload becomes script.
// Set on every response rather than per route, so a route added later cannot
// forget it.
const noSniff: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
};

export interface AppDeps extends RouteDeps {
  // The client's origin (APP_BASE_URL): the one foreign origin a write may
  // come from. See middleware/csrfProtection.ts.
  trustedOrigin: string;
  // TRUST_PROXY: how many proxy hops in front of the API may name the client
  // in X-Forwarded-For. Governs req.ip.
  trustProxy: number;
}

// No listen() here: tests bind an ephemeral port themselves.
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Before anything reads req.ip: whether X-Forwarded-For names the client.
  // Express treats 0 as trusting no proxy.
  app.set('trust proxy', deps.trustProxy);

  // Names no framework to whoever is probing.
  app.disable('x-powered-by');
  // First, so every response carries it: a success, a 404, an error, and a
  // body express.json() refuses to parse.
  app.use(noSniff);

  app.use(express.json());
  // Express 5 can set cookies but not read them; resolveSessionUser, behind
  // both requirePermission and requireAuth, needs req.cookies.
  app.use(cookieParser());
  // Both ahead of every route: a forged write is refused before anything
  // reads its body or its session.
  app.use(createCrossOriginProtection(deps.trustedOrigin));
  app.use(requireXsrfToken);
  app.use('/api', createApiRouter(deps));
  app.use(notFound);
  // Must stay last, after every route and middleware.
  app.use(errorHandler);

  return app;
}
