import type { PermissionScope, ReportedAccount, UserRole } from 'shared';
import { permissionsOf } from '@/test/session';
import { banBlockedReason } from './banReach';

const target = (over: Partial<ReportedAccount> = {}): ReportedAccount => ({
  id: 4,
  login: 'Writer',
  status: 'active',
  role: 'user',
  atBanThreshold: false,
  ...over,
});

const viewer = (id: number, role: UserRole, usersUpdate?: PermissionScope) => ({
  id,
  role,
  permissions: permissionsOf(role, usersUpdate),
});

describe('banBlockedReason', () => {
  it('allows an admin to ban a user or an author', () => {
    expect(banBlockedReason(viewer(1, 'admin'), target())).toBeNull();
    expect(
      banBlockedReason(viewer(1, 'admin'), target({ role: 'author' }))
    ).toBeNull();
  });

  it.each(['admin', 'superadmin'] as const)(
    'keeps an admin from banning a %s',
    (role) => {
      expect(banBlockedReason(viewer(1, 'admin'), target({ role }))).toBe(
        'Only a superadmin can ban an admin or superadmin'
      );
    }
  );

  it('lets a superadmin ban an admin', () => {
    expect(
      banBlockedReason(viewer(1, 'superadmin'), target({ role: 'admin' }))
    ).toBeNull();
  });

  it.each(['none', 'own'] as const)(
    'refuses an admin whose users:update scope is %s',
    (scope) => {
      expect(banBlockedReason(viewer(1, 'admin', scope), target())).toBe(
        'You have no permission to ban accounts'
      );
    }
  );

  it('refuses a user, whose users:update scope is own', () => {
    expect(banBlockedReason(viewer(1, 'user'), target())).toBe(
      'You have no permission to ban accounts'
    );
  });

  it.each([
    [viewer(1, 'admin'), target({ status: 'blocked' }), 'Already banned'],
    [viewer(4, 'superadmin'), target(), "You can't ban yourself"],
    [null, target(), 'Sign in to ban accounts'],
  ])('refuses with a reason: %p', (who, account, reason) => {
    expect(banBlockedReason(who, account)).toBe(reason);
  });
});
