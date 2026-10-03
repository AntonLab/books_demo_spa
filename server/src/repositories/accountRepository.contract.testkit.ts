import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AccountRepository } from './accountRepository.ts';

export interface AccountRepositoryContractWorld {
  repository: AccountRepository;
}

// Registers the cases every AccountRepository must pass, called from
// accountRepository.spec.ts against MySQL and accountRepository.fake.spec.ts
// against the fake. The visibility and count rules are the real one's alone.
export function accountRepositoryContract(
  setUp: () => Promise<AccountRepositoryContractWorld>
): void {
  test('contract: a missing id answers null', async () => {
    const { repository } = await setUp();

    assert.equal(await repository.findProfile(999_999), null);
  });
}
