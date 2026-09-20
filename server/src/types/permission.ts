import { USER_ROLES } from 'shared';

// `as const` unions rather than enums, per the repository rules — the same
// shape as USER_STATUSES in types/user.ts.

// The roles an account can hold, and the two registration may set, are the
// client's business too, so they come from the shared workspace (ADR-0006).
export {
  REGISTRABLE_ROLES,
  USER_ROLES,
  type RegistrableRole,
  type UserRole,
} from 'shared';

// Every role the matrix has a row for. `guest` is not storable: it is what
// requirePermission assumes when there is no session, and it exists so public
// reads are described by the matrix rather than by the absence of a guard.
// Built on USER_ROLES, so a role added there gets its matrix row too.
export const ROLES = ['guest', ...USER_ROLES] as const;
export type Role = (typeof ROLES)[number];

export const MODULES = [
  'users',
  'series',
  'books',
  'chapters',
  'comments',
  'likes',
  'genres',
  'reports',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['create', 'read', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

// `none` refuses outright; `own` allows the caller's own rows; `any` allows
// every row. A boolean could not tell author-updates-own from
// admin-updates-any, and that distinction would fall back into controllers.
export const PERMISSION_SCOPES = ['none', 'own', 'any'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export interface PublicPermission {
  role: Role;
  module: Module;
  action: Action;
  scope: PermissionScope;
}
