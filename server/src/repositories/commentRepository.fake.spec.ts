import { describe } from 'node:test';
import type { AuthorSummary } from 'shared';
import { commentRepositoryContract } from './commentRepository.contract.testkit.ts';
import { createFakeCommentRepository } from './commentRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract
// commentRepository.spec.ts runs against MySQL. Needs no database.
describe('the fake commentRepository', () => {
  commentRepositoryContract(async () => {
    const accounts = new Map<number, AuthorSummary>();
    const books = new Set<number>();

    return {
      repository: createFakeCommentRepository({ accounts, books }),
      async anAccount() {
        const id = accounts.size + 1;
        accounts.set(id, {
          id,
          login: `reader${id}`,
          firstName: 'Contract',
          lastName: `Reader ${id}`,
          avatarUrl: null,
        });
        return id;
      },
      async aBook() {
        const id = books.size + 1;
        books.add(id);
        return id;
      },
    };
  });
});
