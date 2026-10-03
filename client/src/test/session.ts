import { ACTIONS, MODULES, isModeratorRole } from 'shared';
import type { PermissionScope, SessionPermissions, UserRole } from 'shared';
import type { PublicUser, SessionUser } from '@/types/api';

// Mimics the server's permission matrix for the one scope the client reads
// (users:update); every other cell is 'none'.
export const permissionsOf = (
  role: UserRole,
  usersUpdate?: PermissionScope
): SessionPermissions => {
  const permissions = Object.fromEntries(
    MODULES.map((module) => [
      module,
      Object.fromEntries(ACTIONS.map((action) => [action, 'none'])),
    ])
  ) as SessionPermissions;
  permissions.users.update =
    usersUpdate ?? (isModeratorRole(role) ? 'any' : 'own');
  return permissions;
};

export const sessionOf = (
  user: PublicUser,
  usersUpdate?: PermissionScope
): SessionUser => ({
  ...user,
  permissions: permissionsOf(user.role, usersUpdate),
});
