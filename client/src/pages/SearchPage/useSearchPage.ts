import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { PublicGenre } from 'shared';
import { useBookSearch } from '@/queries/books';
import { useGenresWithBooks } from '@/queries/genres';
import {
  fieldErrorsOf,
  filterCount,
  formValuesOf,
  listParamsOf,
  parseBookSearch,
  searchOf,
  toSearchParams,
  type BookSearchFormValues,
  type SearchFieldError,
} from '@/types/bookSearch';

export type SearchBooks = ReturnType<typeof useBookSearch>;

// While the URL's Genre is unresolved or gone the book query is disabled but
// keyed with `genreId: undefined`, the same key as the same search without a
// genre, so its data can be another search's cache entry. These statuses
// therefore carry no `books` at all.
export type SearchResults =
  | { status: 'genre-loading' | 'genre-error' | 'genre-gone' }
  | { status: 'ready'; books: SearchBooks; goToPage: (page: number) => void };

export interface SearchPageState {
  filterCount: number;
  genres: PublicGenre[];
  form: {
    // antd reads initialValues once, so the form remounts whenever the URL,
    // or the Genre it resolves to, changes.
    key: string;
    initialValues: BookSearchFormValues;
    fieldErrors: SearchFieldError[];
    onSearch: (values: BookSearchFormValues) => void;
    onReset: () => void;
  };
  results: SearchResults;
}

// The URL is the only source of the search: a Search, a page change, a
// reload, a pasted link and Back all read it the same way. Every field
// combines with the others by AND.
export const useSearchPage = (): SearchPageState => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = parseBookSearch(searchParams);
  const genres = useGenresWithBooks();

  // A `genre` counts only once the list the select offers holds it: a
  // malformed id, an unknown one or one with no published Book is gone, and
  // no book is asked for until it is known either way.
  const genre =
    search.genre === undefined
      ? undefined
      : genres.data?.items.find((entry) => String(entry.id) === search.genre);
  const genreBlocked = search.genre !== undefined && genre === undefined;

  const books = useBookSearch(listParamsOf(search, genre?.id), !genreBlocked);
  const fieldErrors = useMemo(
    () => fieldErrorsOf(genreBlocked ? null : books.error),
    [genreBlocked, books.error]
  );

  // Past the end the server serves its last non-empty page; the URL follows
  // it without a history entry of its own. Never while the Genre is blocked:
  // `current` would then be read from another search's cache entry.
  const served = genreBlocked ? undefined : books.data?.current;
  useEffect(() => {
    if (served === undefined || served === search.page) return;
    setSearchParams(
      toSearchParams({ ...parseBookSearch(searchParams), page: served }),
      { replace: true }
    );
  }, [served, search.page, searchParams, setSearchParams]);

  const results: SearchResults = !genreBlocked
    ? {
        status: 'ready',
        books,
        goToPage: (page) =>
          setSearchParams(toSearchParams({ ...search, page })),
      }
    : genres.isPending
      ? { status: 'genre-loading' }
      : genres.isError
        ? { status: 'genre-error' }
        : { status: 'genre-gone' };

  return {
    filterCount: filterCount(search),
    genres: genres.data?.items ?? [],
    form: {
      key: `${searchParams.toString()}|${genre?.id ?? ''}`,
      initialValues: formValuesOf(search, genre?.id),
      fieldErrors,
      onSearch: (values) => setSearchParams(toSearchParams(searchOf(values))),
      onReset: () => setSearchParams({}),
    },
    results,
  };
};
