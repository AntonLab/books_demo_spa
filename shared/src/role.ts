// `as const` unions rather than enums, per the repository rules. Only the roles
// an account can hold live here; `ROLES`, which adds `guest` for the
// permission matrix, and the matrix's modules, actions and scopes are the
// server's alone and stay in server/src/types/permission.ts.

// What may actually sit in users.role. `guest` is deliberately absent: it is
// what the server assumes for a caller with no session, never a value a row
// carries.
export const USER_ROLES = ['user', 'author', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// What registration may set. admin and superadmin are unreachable from the
// public form by construction rather than by a check.
export const REGISTRABLE_ROLES = ['user', 'author'] as const;
export type RegistrableRole = (typeof REGISTRABLE_ROLES)[number];
