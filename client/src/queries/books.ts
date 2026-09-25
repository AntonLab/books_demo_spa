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
  type ListBooksParams,
  type UpdateBookPayload,
} from '../api/books';
import type { BookSort } from 'shared';
import { PAGE_SIZE_MAX } from 'shared';
import { queryKeys } from './keys';

const BOOKS_PAGE_SIZE = 20;
export const SUGGESTIONS_SIZE = 8;

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

// A series' books, in its Series order: the server sorts a `seriesId` list by
// position rather than by id, and leaves out what the viewer may not read.
// ponytail: one page at the server's cap; page it if a series ever outgrows 100.
export const useBooksInSeries = (seriesId: number) => {
  return useQuery({
    queryKey: queryKeys.books({ seriesId, pageSize: PAGE_SIZE_MAX }),
    queryFn: () => listBooks({ seriesId, pageSize: PAGE_SIZE_MAX }),
  });
};

// The search form's Text and Author suggestions: the first few books the term
// finds, one cache entry per term, as the Co-author picker does. A blank term
// asks for nothing, since the server refuses one.
// ponytail: a request per keystroke, debounce if the server feels it.
export const useBookSuggestions = (field: 'q' | 'author', term: string) => {
  const params: ListBooksParams = {
    ...(field === 'q' ? { q: term } : { author: term }),
    pageSize: SUGGESTIONS_SIZE,
  };
  return useQuery({
    queryKey: queryKeys.books(params),
    queryFn: () => listBooks(params),
    enabled: term !== '',
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
