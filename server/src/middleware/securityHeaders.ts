import type { RequestHandler } from 'express';

// Stops a browser second-guessing a response's Content-Type: sniffing a JSON
// error or an uploaded image as HTML is how a stored payload becomes script.
// Set on every response rather than per route, so a route added later cannot
// forget it.
export const noSniff: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};
