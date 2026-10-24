import { describe } from 'node:test';
import type { PublicBook } from 'shared';
import { libraryRepositoryContract } from './libraryRepository.contract.testkit.ts';
import {
  aLibraryBook,
  createFakeLibraryRepository,
  type FakeLibraryRepositoryOptions,
} from './libraryRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract the MySQL spec runs
// against the real repository. Needs no database.
describe('the fake libraryRepository', () => {
  libraryRepositoryContract(async () => {
    const accounts = new Set<number>();
    const books = new Map<number, PublicBook>();

    const series = new Map<number, { authorIds: number[] }>();
    const chapters: NonNullable<FakeLibraryRepositoryOptions['chapters']> = [];

    const repository = createFakeLibraryRepository({
      accounts,
      books,
      series,
      chapters,
    });

    const addBook = (
      authorIds: number[],
      draft: boolean,
      seriesId?: number
    ) => {
      const id = books.size + 1;
      books.set(id, aLibraryBook(id, { authorIds, draft, seriesId }));
      return id;
    };

    return {
      repository,
      async seedStatus(accountId, bookId, status) {
        repository.seedStatus(accountId, bookId, status);
      },
      async aChapter(bookId, { published }) {
        const id = chapters.length + 1;
        chapters.push({
          id,
          bookId,
          position: chapters.filter((c) => c.bookId === bookId).length + 1,
          publishedAt: published ? new Date(0) : null,
        });
        return id;
      },
      async setComplete(bookId) {
        const book = books.get(bookId);
        if (book) books.set(bookId, { ...book, status: 'complete' });
      },
      async aSeries(coAuthorIds) {
        const id = series.size + 1;
        series.set(id, { authorIds: coAuthorIds });
        return id;
      },
      async aBookInSeries(seriesId, coAuthorIds, { draft = false } = {}) {
        return addBook(coAuthorIds, draft, seriesId);
      },
      async anAccount() {
        const id = accounts.size + 1;
        accounts.add(id);
        return id;
      },
      async aBook(coAuthorIds) {
        return addBook(coAuthorIds, false);
      },
      async aDraftBook(coAuthorIds) {
        return addBook(coAuthorIds, true);
      },
      async setDraft(bookId, draft) {
        const book = books.get(bookId);
        if (book) {
          books.set(bookId, {
            ...book,
            status: draft ? 'draft' : 'in_progress',
          });
        }
      },
    };
  });
});
