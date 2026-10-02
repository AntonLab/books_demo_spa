import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBook,
  deleteBook,
  deleteBookCover,
  getBook,
  listBooks,
  listFavoritedBooks,
  updateBook,
  uploadBookCover,
  type ListBooksParams,
} from '../api/books';
import type { BookSort, CreateBookPayload, UpdateBookPayload } from 'shared';
import { PAGE_SIZE_MAX } from 'shared';
import { queryKeys } from './keys';

const BOOKS_PAGE_SIZE = 20;

// A ranking's first `pageSize` books, for the main page's sections; the search
// page pages through `useBookSearch` instead.
export const useSortedBooks = (sort: BookSort, pageSize = BOOKS_PAGE_SIZE) => {
  return useQuery({
    queryKey: queryKeys.books({ sort, pageSize }),
    queryFn: () => listBooks({ sort, pageSize }),
  });
};

// The search page's one query: every filter, the page and its size, straight
// from the URL. `enabled` is false while the URL's Genre is unresolved or
// gone, so no book is asked for then; a disabled query reports isPending
// forever, which is why useSearchPage hands the page no books in that state.
export const useBookSearch = (params: ListBooksParams, enabled: boolean) => {
  return useQuery({
    queryKey: queryKeys.books(params),
    queryFn: () => listBooks(params),
    enabled,
  });
};

// The key carries `favoritedBy` so a favorited list never shares a cache entry
// with the same search over all works.
export const useFavoritedBooks = (
  params: ListBooksParams,
  enabled: boolean
) => {
  return useQuery({
    queryKey: queryKeys.books({ ...params, favoritedBy: 'me' }),
    queryFn: () => listFavoritedBooks(params),
    enabled,
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

export const useBook = (id: number) => {
  return useQuery({
    queryKey: queryKeys.book(id),
    queryFn: () => getBook(id),
  });
};

// Every book write invalidates the whole `books` prefix: a change to one book
// can move it into or out of any list (a status change hides it from the main
// page), and the detail key sits under the same prefix. The `series` prefix
// goes too, because filing a book into a series, or taking it out, changes that
// series' book list. The `genres` prefix goes as well: a status change can
// move a Genre into or out of the list of Genres with a published book.
// `refreshOnError` is for a delete: one that fails because the book is already
// gone (404) or no longer editable (403) leaves the lists stale, whereas a
// failed update must not refetch the form's own data under the user's edits.
const useBookMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  { refreshOnError = false }: { refreshOnError?: boolean } = {}
) => {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['books'] }),
      queryClient.invalidateQueries({ queryKey: ['series'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.genres }),
    ]);

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: refresh,
    ...(refreshOnError && { onError: refresh }),
  });
};

export const useCreateBook = () =>
  useBookMutation((payload: CreateBookPayload) => createBook(payload));

export const useUpdateBook = (id: number) =>
  useBookMutation((payload: UpdateBookPayload) => updateBook(id, payload));

export const useDeleteBook = (id: number) =>
  useBookMutation(() => deleteBook(id), { refreshOnError: true });

// A Cover change invalidates the books prefix, exactly as every other book
// mutation does: a PublicBook in any list may carry it.
export const useUploadBookCover = (id: number) =>
  useBookMutation((file: File) => uploadBookCover(id, file));

export const useDeleteBookCover = (id: number) =>
  useBookMutation(() => deleteBookCover(id));
