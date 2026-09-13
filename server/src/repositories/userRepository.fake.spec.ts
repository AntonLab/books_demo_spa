import { describe } from 'node:test';
import { userRepositoryContract } from './userRepository.contract.testkit.ts';
import { createFakeUserRepository } from './userRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract userRepository.spec.ts
// runs against MySQL. Needs no database.
describe('the fake userRepository', () => {
  userRepositoryContract(async () => ({
    repository: createFakeUserRepository(),
  }));
});
