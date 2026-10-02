import type { LibraryBook, PublicLibraryEntry, ReadingStatus } from 'shared';
import type { ListLibraryQuery } from '../types/library.ts';
import type { Viewer } from './visibility.ts';

// The signed-in account a Library belongs to. Never a Guest: every route that
// reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

export interface LibraryRepository {
  // A Book the account may not read is the same NotFoundError('Book', id) as a
  // missing one. Setting again replaces the status and refreshes updatedAt.
  set(
    bookId: number,
    status: ReadingStatus,
    account: Account
  ): Promise<PublicLibraryEntry>;
  // Always resolves: clearing nothing, or a missing Book, is not an error.
  clear(bookId: number, accountId: number): Promise<void>;
  // Newest change first, Published Books only; without a status filter, Not
  // interested entries are left out.
  list(
    query: ListLibraryQuery,
    account: Account
  ): Promise<{ items: LibraryBook[]; total: number }>;
}
