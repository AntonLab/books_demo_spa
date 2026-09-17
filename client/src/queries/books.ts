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
import { queryKeys } from './keys';

// The first page only. Paging is a documented non-goal; `total` is kept so the
// count can be displayed and paging added later without a state change.
export const BOOKS_PAGE_SIZE = 20;

export const useBooks = () => {
  return useQuery({
    queryKey: queryKeys.books({ limit: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ limit: BOOKS_PAGE_SIZE }),
  });
};

// `enabled` keeps a blank term off the network entirely. It agrees with
// `listBooks`, which already omits an empty `q` because the server's schema
// rejects it (`z.string().min(1)`) — but neither guard makes the other
// redundant: that one shapes the URL, this one stops the request happening.
//
// A disabled query reports `isPending: true` with `fetchStatus: 'idle'`
// indefinitely, which is why SearchPage must return before rendering BookList
// when the term is blank.
export const useSearchBooks = (q: string) => {
  return useQuery({
    queryKey: queryKeys.books({ q, limit: BOOKS_PAGE_SIZE }),
    queryFn: () => listBooks({ q, limit: BOOKS_PAGE_SIZE }),
    enabled: q.length > 0,
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
    queryKey: queryKeys.books({ userId, limit: MY_BOOKS_LIMIT }),
    queryFn: () => listBooks({ userId, limit: MY_BOOKS_LIMIT }),
    enabled: userId !== undefined,
  });
};

// The server's list cap. "My books" is one author's catalogue, not a feed, so a
// single full page stands in for paging.
export const MY_BOOKS_LIMIT = 100;

// Every book write invalidates the whole `books` prefix: a change to one book
// can move it into or out of any list (a status change hides it from the main
// page), and the detail key sits under the same prefix. The `series` prefix
// goes too, because filing a book into a series, or taking it out, changes that
// series' book list.
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
