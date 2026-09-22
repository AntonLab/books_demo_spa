import { describe } from 'node:test';
import type { PublicGenre } from '../types/genre.ts';
import type { AuthorSummary } from '../types/user.ts';
import { seriesRepositoryContract } from './seriesRepository.contract.testkit.ts';
import { createFakeSeriesRepository } from './seriesRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract
// seriesRepository.spec.ts runs against MySQL. Needs no database.
describe('the fake seriesRepository', () => {
  seriesRepositoryContract(async () => {
    const accounts = new Map<number, AuthorSummary>();
    const books = new Map<number, number | null>();
    const genres = new Map<number, PublicGenre>();

    return {
      repository: createFakeSeriesRepository({ accounts, books, genres }),
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
      async aBookIn(seriesId) {
        const id = books.size + 1;
        books.set(id, seriesId);
        return id;
      },
      async aGenre() {
        const id = genres.size + 1;
        genres.set(id, { id, name: `Genre ${id}` });
        return id;
      },
    };
  });
});
