import { USER_ROLES } from 'shared';
import type { Action, Module, PermissionScope } from 'shared';

// `as const` unions rather than enums, per the repository rules — the same
// shape as USER_STATUSES in types/user.ts.

// Every role the matrix has a row for. `guest` is not storable: it is what
// requirePermission assumes when there is no session, and it exists so public
// reads are described by the matrix rather than by the absence of a guard.
// Built on USER_ROLES, so a role added there gets its matrix row too.
export const ROLES = ['guest', ...USER_ROLES] as const;
export type Role = (typeof ROLES)[number];

export { MODULES, ACTIONS, PERMISSION_SCOPES } from 'shared';
export type { Module, Action, PermissionScope } from 'shared';

export interface PublicPermission {
  role: Role;
  module: Module;
  action: Action;
  scope: PermissionScope;
}
