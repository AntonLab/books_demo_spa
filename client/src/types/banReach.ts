import type { ReportedAccount, UserRole } from 'shared';

// Mirrors the server's `assertMayTouch` (userController); the server stays the
// authority, this only keeps a doomed button from being offered.
export const banBlockedReason = (
  viewer: { id: number; role: UserRole } | null | undefined,
  target: ReportedAccount
): string | null => {
  if (!viewer) return 'Sign in to ban accounts';
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
