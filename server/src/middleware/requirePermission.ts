import type { RequestHandler } from 'express';
import { resolveSessionUser, type RequireAuthDeps } from './sessionUser.ts';
import { scopeFor } from '../permissions/permissionStore.ts';
import { ForbiddenError, UnauthorizedError } from '../types/errors.ts';
import type { Action, Module } from '../types/permission.ts';

// The route-chain half of enforcement. It can refuse `none` outright, but it
// cannot judge `own` — the row is not loaded yet — so it hands the scope to
// the handler and the controller compares owners from there.
//
// Mount it before `validate`, as requireAuth is mounted today, so a refused
// request is never parsed or echoed back in a 400.
export function createRequirePermission(
  deps: RequireAuthDeps
): (module: Module, action: Action) => RequestHandler {
  return (module, action) => async (req, _res, next) => {
    const user = await resolveSessionUser(deps, req);
    // No session at all means the caller acts as `guest`, which is how public
    // reads stay public once every route runs through the matrix.
    const role = user?.role ?? 'guest';
    const scope = scopeFor(role, module, action);

    if (scope === 'none') {
      // 401 and 403 are different answers and must stay so: for an anonymous
      // caller the useful reply is "identify yourself", and every route spec
      // asserts that today.
      next(user ? new ForbiddenError() : new UnauthorizedError());
      return;
    }

    if (user) req.user = user;
    req.permissionScope = scope;
    next();
  };
}
