import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
import { BOOK_IDS_MAX, PAGE_SIZE_MAX } from 'shared';
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

export const RECENTLY_VIEWED_SIZE = 6;

// The Books of a viewing history, newest first. The request and key use the ids
// as a set, so a re-opened Book (order change only) reuses the cached answer.
export const useRecentlyViewedBooks = (ids: number[]) => {
  const asked = [...ids].sort((a, b) => a - b).join(',');
  return useQuery({
    queryKey: queryKeys.books({ ids: asked, pageSize: BOOK_IDS_MAX }),
    queryFn: () => listBooks({ ids: asked, pageSize: BOOK_IDS_MAX }),
    enabled: ids.length > 0,
    // The slice comes after the server dropped some: BOOK_IDS_MAX ids are
    // asked so that RECENTLY_VIEWED_SIZE can still show.
    select: (page) =>
      page.items
        .filter((item) => ids.includes(item.id))
        .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
        .slice(0, RECENTLY_VIEWED_SIZE),
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
  {
    refreshOnError = false,
    deletedId,
  }: { refreshOnError?: boolean; deletedId?: number } = {}
) => {
  const queryClient = useQueryClient();
  const refresh = (skipDetail?: boolean) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.allBooks,
        // A delete skips the deleted book's own detail: its page is still
        // mounted, would refetch into a 404 and redirect with "no longer
        // exists" before the delete's own landing page takes over.
        ...(skipDetail &&
          deletedId !== undefined && {
            predicate: (query) =>
              hashKey(query.queryKey) !== hashKey(queryKeys.book(deletedId)),
          }),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.allSeries }),
      queryClient.invalidateQueries({ queryKey: queryKeys.genres }),
    ]);

  return useMutation({
    // Wrapped rather than passed straight through: TanStack calls a mutationFn
    // with a second context argument an API function never declared.
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => refresh(true),
    ...(refreshOnError && { onError: () => refresh() }),
  });
};

export const useCreateBook = () =>
  useBookMutation((payload: CreateBookPayload) => createBook(payload));

export const useUpdateBook = (id: number) =>
  useBookMutation((payload: UpdateBookPayload) => updateBook(id, payload));

export const useDeleteBook = (id: number) =>
  useBookMutation(() => deleteBook(id), {
    refreshOnError: true,
    deletedId: id,
  });

// A Cover change invalidates the books prefix, exactly as every other book
// mutation does: a PublicBook in any list may carry it.
export const useUploadBookCover = (id: number) =>
  useBookMutation((file: File) => uploadBookCover(id, file));

export const useDeleteBookCover = (id: number) =>
  useBookMutation(() => deleteBookCover(id));
