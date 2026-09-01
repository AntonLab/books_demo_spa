declare global {
  namespace Express {
    interface Request {
      // Express 5 exposes req.query as a getter with no setter, so validated
      // values are parked here rather than written back onto the request.
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
