import { describe } from 'node:test';
import type { AuthorSummary } from '../types/user.ts';
import { bookRepositoryContract } from './bookRepository.contract.testkit.ts';
import {
  createFakeBookRepository,
  type FakeSeries,
} from './bookRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract bookRepository.spec.ts
// runs against MySQL. Needs no database.
describe('the fake bookRepository', () => {
  bookRepositoryContract(async () => {
    const accounts = new Map<number, AuthorSummary>();
    const series = new Map<number, FakeSeries>();

    return {
      repository: createFakeBookRepository({ accounts, series }),
      async anAuthor() {
        const id = accounts.size + 1;
        accounts.set(id, {
          id,
          login: `author${id}`,
          firstName: 'Contract',
          lastName: `Author ${id}`,
          avatarUrl: null,
        });
        return id;
      },
      async aSeries(coAuthorIds) {
        const id = series.size + 1;
        series.set(id, { title: `Series ${id}`, coAuthorIds });
        return id;
      },
    };
  });
});
