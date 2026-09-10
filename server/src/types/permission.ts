// `as const` unions rather than enums, per the repository rules — the same
// shape as USER_STATUSES in types/user.ts.

// Every role the matrix has a row for. `guest` is not storable: it is what
// requirePermission assumes when there is no session, and it exists so public
// reads are described by the matrix rather than by the absence of a guard.
export const ROLES = [
  'guest',
  'user',
  'author',
  'admin',
  'superadmin',
] as const;
export type Role = (typeof ROLES)[number];

// What may actually sit in users.role. `guest` is deliberately absent.
export const USER_ROLES = ['user', 'author', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// What registration may set. admin and superadmin are unreachable from the
// public form by construction rather than by a check.
export const REGISTRABLE_ROLES = ['user', 'author'] as const;
export type RegistrableRole = (typeof REGISTRABLE_ROLES)[number];

export const MODULES = [
  'users',
  'series',
  'books',
  'chapters',
  'comments',
  'likes',
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
