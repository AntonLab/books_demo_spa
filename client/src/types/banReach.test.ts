import type { ReportedAccount } from 'shared';
import { banBlockedReason } from './banReach';

const target = (over: Partial<ReportedAccount> = {}): ReportedAccount => ({
  id: 4,
  login: 'Writer',
  status: 'active',
  role: 'user',
  atBanThreshold: false,
  ...over,
});

describe('banBlockedReason', () => {
  it('allows an admin to ban a user or an author', () => {
    expect(banBlockedReason({ id: 1, role: 'admin' }, target())).toBeNull();
    expect(
      banBlockedReason({ id: 1, role: 'admin' }, target({ role: 'author' }))
    ).toBeNull();
  });

  it.each(['admin', 'superadmin'] as const)(
    'keeps an admin from banning a %s',
    (role) => {
      expect(banBlockedReason({ id: 1, role: 'admin' }, target({ role }))).toBe(
        'Only a superadmin can ban an admin or superadmin'
      );
    }
  );

  it('lets a superadmin ban an admin', () => {
    expect(
      banBlockedReason({ id: 1, role: 'superadmin' }, target({ role: 'admin' }))
    ).toBeNull();
  });

  it.each([
    [
      { id: 1, role: 'admin' as const },
      target({ status: 'blocked' }),
      'Already banned',
    ],
    [
      { id: 4, role: 'superadmin' as const },
      target(),
      "You can't ban yourself",
    ],
    [null, target(), 'Sign in to ban accounts'],
  ])('refuses with a reason: %p', (viewer, account, reason) => {
    expect(banBlockedReason(viewer, account)).toBe(reason);
  });
});
