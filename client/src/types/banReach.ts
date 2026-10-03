import type { ReportedAccount } from 'shared';
import type { SessionUser } from './api';

// The scope mirrors the server's `users:update` gate and the role rule mirrors
// `assertMayTouch` (userController); the server stays the authority, this only
// keeps a doomed button from being offered.
export const banBlockedReason = (
  viewer: Pick<SessionUser, 'id' | 'role' | 'permissions'> | null | undefined,
  target: ReportedAccount
): string | null => {
  if (!viewer) return 'Sign in to ban accounts';
  if (viewer.permissions.users.update !== 'any') {
    return 'You have no permission to ban accounts';
  }
  if (viewer.id === target.id) return "You can't ban yourself";
  if (target.status === 'blocked') return 'Already banned';
  if (
    viewer.role !== 'superadmin' &&
    target.role !== 'user' &&
    target.role !== 'author'
  ) {
    return 'Only a superadmin can ban an admin or superadmin';
  }
  return null;
};
