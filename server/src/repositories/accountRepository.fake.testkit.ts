import type { AccountProfile } from 'shared';
import type { AccountRepository } from './accountRepository.ts';

export interface FakeAccountRepositoryOptions {
  profiles?: AccountProfile[];
}

// An in-memory AccountRepository for the route specs: answers a stored
// profile by id, else null. Status and visibility rules stay in the real
// repository, covered against MySQL.
export function createFakeAccountRepository(
  options: FakeAccountRepositoryOptions = {}
): AccountRepository {
  const profiles = new Map(
    (options.profiles ?? []).map((profile) => [profile.id, profile])
  );

  return {
    findProfile: async (id) => profiles.get(id) ?? null,
  };
}
