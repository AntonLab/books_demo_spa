import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { seedSession, seededClient, sessionOf } from '@/test/session';
import type { PublicUser } from '@/types/api';

const user: PublicUser = {
  id: 5,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Annson',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  about: '',
  showLastSeen: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('seedSession', () => {
  it('seeds the user as a SessionUser', () => {
    const client = createTestQueryClient();
    seedSession(client, user);
    expect(client.getQueryData(queryKeys.session)).toEqual(sessionOf(user));
  });

  it('seeds a Guest as null', () => {
    const client = createTestQueryClient();
    seedSession(client, null);
    expect(client.getQueryData(queryKeys.session)).toBeNull();
  });

  it('passes usersUpdate on to the permissions', () => {
    const client = createTestQueryClient();
    seedSession(client, user, 'any');
    expect(client.getQueryData(queryKeys.session)).toEqual(
      sessionOf(user, 'any')
    );
  });

  it('seededClient seeds the same session', () => {
    expect(seededClient(user).getQueryData(queryKeys.session)).toEqual(
      sessionOf(user)
    );
    expect(seededClient(null).getQueryData(queryKeys.session)).toBeNull();
  });
});
