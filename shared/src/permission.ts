import type { PublicUser } from './user.ts';

export const MODULES = [
  'users',
  'series',
  'books',
  'chapters',
  'comments',
  'likes',
  'favorites',
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

// What the signed-in Account may do, dense: every module and action present.
export type SessionPermissions = Record<
  Module,
  Record<Action, PermissionScope>
>;

// What register, login and /me return: the Account plus its permissions.
export interface SessionUser extends PublicUser {
  permissions: SessionPermissions;
}
