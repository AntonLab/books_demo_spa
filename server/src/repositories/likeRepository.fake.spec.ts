import { describe } from 'node:test';
import { likeRepositoryContract } from './likeRepository.contract.testkit.ts';
import { createFakeLikeRepository } from './likeRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract likeRepository.spec.ts
// runs against MySQL. Needs no database.
describe('the fake likeRepository', () => {
  likeRepositoryContract(async () => {
    const accounts = new Set<number>();
    const books = new Map<number, number[]>();
    const comments = new Map<number, number>();

    return {
      repository: createFakeLikeRepository({ accounts, books, comments }),
      async anAccount() {
        const id = accounts.size + 1;
        accounts.add(id);
        return id;
      },
      async aBook(coAuthorIds) {
        const id = books.size + 1;
        books.set(id, coAuthorIds);
        return id;
      },
      async aComment(_bookId, ownerId) {
        const id = comments.size + 1;
        comments.set(id, ownerId);
        return id;
      },
    };
  });
});
