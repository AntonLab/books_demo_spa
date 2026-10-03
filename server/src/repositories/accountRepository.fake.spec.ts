import { describe } from 'node:test';
import { accountRepositoryContract } from './accountRepository.contract.testkit.ts';
import { createFakeAccountRepository } from './accountRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract accountRepository.spec.ts
// runs against MySQL. Needs no database.
describe('the fake accountRepository', () => {
  accountRepositoryContract(async () => ({
    repository: createFakeAccountRepository(),
  }));
});
