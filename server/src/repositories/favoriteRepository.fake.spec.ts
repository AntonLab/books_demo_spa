import { describe } from 'node:test';
import type { PublicBook, PublicSeries } from 'shared';
import { favoriteRepositoryContract } from './favoriteRepository.contract.testkit.ts';
import {
  aPublicBook,
  aPublicSeries,
  createFakeFavoriteRepository,
} from './favoriteRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract
// favoriteRepository.spec.ts runs against MySQL. Needs no database.
describe('the fake favoriteRepository', () => {
  favoriteRepositoryContract(async () => {
    const accounts = new Set<number>();
    const books = new Map<number, PublicBook>();
    const series = new Map<number, PublicSeries>();

    return {
      repository: createFakeFavoriteRepository({ accounts, books, series }),
      async anAccount() {
        const id = accounts.size + 1;
        accounts.add(id);
        return id;
      },
      async aBook() {
        const id = books.size + 1;
        books.set(id, aPublicBook(id));
        return id;
      },
      async aSeries() {
        const id = series.size + 1;
        series.set(id, aPublicSeries(id));
        return id;
      },
    };
  });
});
