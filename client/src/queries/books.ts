import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBook,
  deleteBook,
  deleteBookCover,
  getBook,
  listBooks,
  updateBook,
  uploadBookCover,
  type CreateBookPayload,
  type UpdateBookPayload,
} from '../api/books';
import type { BookSort } from '../types/book';
import { PAGE_SIZE_MAX } from '../types/api';
import { queryKeys } from './keys';

// The first page only. Paging is a documented non-goal; `total` is kept so the
// count can be displayed and paging added later without a state change.
export const BOOKS_PAGE_SIZE = 20;

// A ranking's first `pageSize` books: the main page shows a few of each, the
// search page a full page.
export const useSortedBooks = (sort: BookSort, pageSize = BOOKS_PAGE_SIZE) => {
  return useQuery({
    queryKey: queryKeys.books({ sort, pageSize }),
    queryFn: () => listBooks({ sort, pageSize }),
  });
};

// `enabled` keeps a blank term off the network entirely. It agrees with
// `listBooks`, which already omits an empty `q` because the server's schema
// rejects it (`z.string().min(1)`) — but neither guard makes the other
// redundant: that one shapes the URL, this one stops the request happening.
//
// A disabled query reports `isPending: true` with `fetchStatus: 'idle'`
// indefinitely, which is why SearchPage must return before rendering CardList
// when the term is blank.
export const useSearchBooks = (q: string) => {
  return useQuery({
    queryKey: queryKeys.books({ q, pageSize: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ q, pageSize: BOOKS_PAGE_SIZE }),
    enabled: q.length > 0,
  });
};

// A series' books, in its Series order: the server sorts a `seriesId` list by
// position rather than by id, and leaves out what the viewer may not read.
// ponytail: one page at the server's cap; page it if a series ever outgrows 100.
export const useBooksInSeries = (seriesId: number) => {
  return useQuery({
    queryKey: queryKeys.books({ seriesId, pageSize: PAGE_SIZE_MAX }),
    queryFn: () => listBooks({ seriesId, pageSize: PAGE_SIZE_MAX }),
  });
};

// One Genre's books: the server's default order (oldest first, by id), drafts excluded
// as in every public list. One page, like every search result — Genre results
// are capped at a page rather than paged.
export const useBooksInGenre = (genreId: number) => {
  return useQuery({
    queryKey: queryKeys.books({ genreId, pageSize: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ genreId, pageSize: BOOKS_PAGE_SIZE }),
  });
};

export const useBook = (id: number) => {
  return useQuery({
    queryKey: queryKeys.book(id),
    queryFn: () => getBook(id),
  });
};

// A Co-author's own books, drafts included: the server widens a list to drafts
// only when `?userId=` names the caller. `enabled` waits for the session, so
// the page never asks for a list with no id in it.
export const useMyBooks = (userId: number | undefined) => {
  return useQuery({
    queryKey: queryKeys.books({ userId, pageSize: PAGE_SIZE_MAX }),
    queryFn: () => listBooks({ userId, pageSize: PAGE_SIZE_MAX }),
    enabled: userId !== undefined,
  });
};

// Every book write invalidates the whole `books` prefix: a change to one book
// can move it into or out of any list (a status change hides it from the main
// page), and the detail key sits under the same prefix. The `series` prefix
// goes too, because filing a book into a series, or taking it out, changes that
// series' book list. The `genres` prefix goes as well: a status change can
// move a Genre into or out of the list of Genres with a published book.
const useBookMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['books'] }),
        queryClient.invalidateQueries({ queryKey: ['series'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.genres }),
      ]),
  });
};

export const useCreateBook = () =>
  useBookMutation((payload: CreateBookPayload) => createBook(payload));

export const useUpdateBook = (id: number) =>
  useBookMutation((payload: UpdateBookPayload) => updateBook(id, payload));

export const useDeleteBook = (id: number) =>
  useBookMutation(() => deleteBook(id));

// A Cover change invalidates the books prefix, exactly as every other book
// mutation does (K3): a PublicBook in any list may carry it.
export const useUploadBookCover = (id: number) =>
  useBookMutation((file: File) => uploadBookCover(id, file));

export const useDeleteBookCover = (id: number) =>
  useBookMutation(() => deleteBookCover(id));
