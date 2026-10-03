import { describe } from 'node:test';
import type { PublicBook } from 'shared';
import { libraryRepositoryContract } from './libraryRepository.contract.testkit.ts';
import {
  aLibraryBook,
  createFakeLibraryRepository,
} from './libraryRepository.fake.testkit.ts';

// The fake the route specs run on, held to the contract the MySQL spec runs
// against the real repository. Needs no database.
describe('the fake libraryRepository', () => {
  libraryRepositoryContract(async () => {
    const accounts = new Set<number>();
    const books = new Map<number, PublicBook>();

    const addBook = (authorIds: number[], draft: boolean) => {
      const id = books.size + 1;
      books.set(id, aLibraryBook(id, { authorIds, draft }));
      return id;
    };

    return {
      repository: createFakeLibraryRepository({ accounts, books }),
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
