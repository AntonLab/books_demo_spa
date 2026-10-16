import { ACTIONS, MODULES, isModeratorRole } from 'shared';
import type { PermissionScope, SessionPermissions, UserRole } from 'shared';
import type { QueryClient } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
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

// `null` seeds a Guest. Seed through this, never `setQueryData` directly: that
// key is untyped, so a bare `PublicUser` would type-check.
export const seedSession = (
  client: QueryClient,
  user: PublicUser | null,
  usersUpdate?: PermissionScope
): void => {
  client.setQueryData(queryKeys.session, user && sessionOf(user, usersUpdate));
};

export const seededClient = (user: PublicUser | null): QueryClient => {
  const queryClient = createTestQueryClient();
  seedSession(queryClient, user);
  return queryClient;
};
