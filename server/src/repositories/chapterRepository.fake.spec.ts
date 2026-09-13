import { describe } from 'node:test';
import { chapterRepositoryContract } from './chapterRepository.contract.testkit.ts';
import { createFakeChapterRepository } from './chapterRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract
// chapterRepository.spec.ts runs against MySQL. Needs no database.
describe('the fake chapterRepository', () => {
  chapterRepositoryContract(async () => {
    const books = new Map<number, number[]>();
    let accounts = 0;

    return {
      repository: createFakeChapterRepository({ books }),
      async anAuthor() {
        accounts += 1;
        return accounts;
      },
      async aBook(coAuthorIds) {
        const id = books.size + 1;
        books.set(id, coAuthorIds);
        return id;
      },
    };
  });
});
