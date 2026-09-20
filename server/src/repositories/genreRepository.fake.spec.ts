import { describe } from 'node:test';
import { genreRepositoryContract } from './genreRepository.contract.testkit.ts';
import { createFakeGenreRepository } from './genreRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract genreRepository.spec.ts
// runs against MySQL. Needs no database.
describe('the fake genreRepository', () => {
  genreRepositoryContract(async () => ({
    repository: createFakeGenreRepository(),
  }));
});
