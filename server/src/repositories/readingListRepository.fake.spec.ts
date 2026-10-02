import { describe } from 'node:test';
import type { PublicBook, PublicSeries } from 'shared';
import { readingListContract } from './readingListRepository.contract.testkit.ts';
import {
  aPublicBook,
  aPublicSeries,
} from './favoriteRepository.fake.testkit.ts';
import { createFakeReadingListRepository } from './readingListRepository.fake.testkit.ts';

describe('the fake readingListRepository', () => {
  const setUp = async () => {
    const accounts = new Map<number, string>();
    const books = new Map<number, PublicBook>();
    const series = new Map<number, PublicSeries>();
    const hiddenBooks = new Set<number>();
    const hiddenSeries = new Set<number>();
    return {
      repository: createFakeReadingListRepository({
        accounts,
        books,
        series,
        hiddenBooks,
        hiddenSeries,
      }),
      async anAccount() {
        const id = accounts.size + 1;
        accounts.set(id, `Reader${id}`);
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
      async setBookDraft(id: number, draft: boolean) {
        if (draft) hiddenBooks.add(id);
        else hiddenBooks.delete(id);
      },
      async setSeriesPublic(id: number, isPublic: boolean) {
        if (isPublic) hiddenSeries.delete(id);
        else hiddenSeries.add(id);
      },
      async pause() {},
    };
  };
  readingListContract(setUp);
});
