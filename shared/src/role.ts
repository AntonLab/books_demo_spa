// `as const` unions rather than enums, per the repository rules. The server's
// permission matrix is keyed by these; its modules, actions and scopes are the
// server's alone and stay in server/src/types/permission.ts.

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
