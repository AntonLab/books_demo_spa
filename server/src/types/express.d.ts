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

      // Optional, unlike `validated`: most requests legitimately have no user.
      // Handlers behind requireAuth, or behind requirePermission on an action
      // `guest` is refused, can rely on it being set, and narrow it rather
      // than asserting. requirePermission on a public read sets it only when a
      // session resolves.
      user?: import('./user.ts').PublicUser;

      // Set by requirePermission on a request it lets through, so the handler
      // can tell "your own rows" from "any row" without asking the matrix a
      // second time. Optional, like `user`: a route without the middleware has
      // none.
      permissionScope?: import('./permission.ts').PermissionScope;
    }
  }
}

export {};
