import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { BookSort, GenreListItem } from 'shared';
import { useBookSearch, useFavoritedBooks } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import type { PublicBook } from '@/types/book';
import {
  fieldErrorsOf,
  filterCount,
  formValuesOf,
  genreIdOf,
  listParamsOf,
  parseBookSearch,
  searchOf,
  toSearchParams,
  type BookSearchFormValues,
  type SearchFieldError,
} from '@/types/bookSearch';
import type { ProfileScope } from '@/types/profileScope';

export type ProfileRow<T> = T & { favoriteId?: number };

export interface ProfileList<T> {
  items: ProfileRow<T>[];
  total: number;
  page: number;
  pageSize: number;
  isPending: boolean;
  error: Error | null;
  filtered: boolean;
  goToPage: (page: number, pageSize: number) => void;
}

export interface ProfileFilters {
  filterCount: number;
  genres: GenreListItem[];
  form: {
    // antd reads initialValues once, so the form remounts whenever the URL,
    // or the Genre it resolves to, changes.
    key: string;
    initialValues: BookSearchFormValues;
    fieldErrors: SearchFieldError[];
    onSearch: (values: BookSearchFormValues) => void;
    onReset: () => void;
  };
}

// The request never waits for the genre list: `genreId` comes from the URL
// alone, so a genre the list lacks (a Draft-only one) still filters.
export const useGenreFilter = (raw: string | undefined) => {
  const genres = useGenres().data?.items ?? [];
  const genreId = genreIdOf(raw);
  return {
    genres,
    genre: genres.find((entry) => entry.id === genreId),
    genreId,
    blocked: raw !== undefined && genreId === undefined,
  };
};

export const useProfileBooks = (
  scope: ProfileScope,
  viewerId: number
): ProfileFilters & { sort: BookSort; list: ProfileList<PublicBook> } => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = parseBookSearch(searchParams);
  const { genres, genre, genreId, blocked } = useGenreFilter(search.genre);
  const params = listParamsOf(search, genreId);

  // The forced userId goes last: My works is the viewer's own works, Drafts
  // included, whatever the Author field says.
  const mine = useBookSearch(
    { ...params, userId: viewerId },
    scope === 'mine' && !blocked
  );
  const favorites = useFavoritedBooks(
    params,
    scope === 'favorites' && !blocked
  );
  const query = scope === 'mine' ? mine : favorites;

  const fieldErrors = useMemo(
    () => fieldErrorsOf(blocked ? null : query.error),
    [blocked, query.error]
  );

  return {
    filterCount: filterCount(search),
    genres,
    sort: search.sort,
    form: {
      key: `${searchParams.toString()}|${genre?.id ?? ''}`,
      initialValues: formValuesOf(search, genre?.id),
      fieldErrors,
      onSearch: (values) =>
        setSearchParams(
          toSearchParams({ ...searchOf(values), pageSize: search.pageSize })
        ),
      onReset: () => setSearchParams({}),
    },
    list: {
      // A disabled query is pending forever, so a blocked genre reads nothing.
      items: blocked ? [] : (query.data?.items ?? []),
      total: blocked ? 0 : (query.data?.total ?? 0),
      page: search.page,
      pageSize: search.pageSize,
      isPending: !blocked && query.isPending,
      error: blocked ? null : query.error,
      filtered: filterCount(search) > 0,
      goToPage: (page, pageSize) =>
        setSearchParams(toSearchParams({ ...search, page, pageSize })),
    },
  };
};
