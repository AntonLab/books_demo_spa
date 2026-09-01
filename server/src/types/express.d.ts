declare global {
  namespace Express {
    interface Request {
      // Express 5 exposes req.query as a getter with no setter, so validated
      // values are parked here rather than written back onto the request.
      // Invariant: only routes wired through the `validate()` middleware set
      // this. It is typed as required because all five current routes go
      // through `validate()`, but a future route added without it would read
      // `undefined` here despite the type, throwing at runtime.
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
