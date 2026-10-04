import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { BookSort, GenreListItem } from 'shared';
import { useBookSearch, useFavoritedBooks } from '@/queries/books';
import { useGenres } from '@/queries/genres';
import { useFavoritedSeries, useSeriesList } from '@/queries/series';
import type { PublicSeries } from '@/types/api';
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
import {
  parseSeriesSearch,
  seriesFilterCount,
  seriesFormValuesOf,
  seriesListParamsOf,
  seriesSearchOf,
  toSeriesSearchParams,
} from '@/types/seriesSearch';

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
const useGenreFilter = (raw: string | undefined) => {
  const genres = useGenres().data?.items ?? [];
  const genreId = genreIdOf(raw);
  return {
    genres,
    genre: genres.find((entry) => entry.id === genreId),
    genreId,
    blocked: raw !== undefined && genreId === undefined,
  };
};

export const profileTabOf = (params: URLSearchParams) =>
  params.get('tab') === 'series' ? 'series' : 'books';

// The list is hidden while the page overshoots: a Series page past the end is
// empty, and a Books page past the end is the last page's rows under the wrong
// page number. Callers wrap `moveTo` in `useCallback`.
export const usePageClamp = (
  {
    page,
    pageSize,
    total,
  }: { page: number; pageSize: number; total: number | undefined },
  moveTo: (lastPage: number) => void
): boolean => {
  const lastPage = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  const overshooting = total !== undefined && page > lastPage;
  useEffect(() => {
    if (overshooting) moveTo(lastPage);
  }, [overshooting, lastPage, moveTo]);
  return overshooting;
};

export const useProfileBooks = (
  scope: ProfileScope,
  viewerId: number
): ProfileFilters & { sort: BookSort; list: ProfileList<PublicBook> } => {
  const [searchParams, setSearchParams] = useSearchParams();
  // The Author field is hidden in My works, and userId is always the viewer.
  const search = useMemo(() => {
    const { author, authorId, ...parsed } = parseBookSearch(searchParams);
    return scope === 'mine' ? parsed : { ...parsed, author, authorId };
  }, [searchParams, scope]);
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

  const moveTo = useCallback(
    (last: number) =>
      setSearchParams(toSearchParams({ ...search, page: last }), {
        replace: true,
      }),
    [setSearchParams, search]
  );
  const overshooting = usePageClamp(
    {
      page: search.page,
      pageSize: search.pageSize,
      total: blocked ? undefined : query.data?.total,
    },
    moveTo
  );

  return {
    filterCount: filterCount(search),
    genres,
    sort: search.sort,
    form: {
      key: `${searchParams.toString()}|${genre?.id ?? ''}`,
      initialValues: formValuesOf(search, genre?.id),
      fieldErrors,
      // Page size is a filter of the search state: Search keeps the chosen
      // size, Reset drops it with the other filters (back to the default 20).
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
      isPending: (!blocked && query.isPending) || overshooting,
      error: blocked ? null : query.error,
      filtered: filterCount(search) > 0,
      goToPage: (page, pageSize) =>
        setSearchParams(toSearchParams({ ...search, page, pageSize })),
    },
  };
};

export const useProfileSeries = (
  scope: ProfileScope,
  viewerId: number
): ProfileFilters & { list: ProfileList<PublicSeries> } => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useMemo(() => parseSeriesSearch(searchParams), [searchParams]);
  const { genres, genre, genreId, blocked } = useGenreFilter(search.genre);
  const params = seriesListParamsOf(search, genreId);

  const mine = useSeriesList(
    { ...params, userId: viewerId },
    scope === 'mine' && !blocked
  );
  const favorites = useFavoritedSeries(
    params,
    scope === 'favorites' && !blocked
  );
  const query = scope === 'mine' ? mine : favorites;

  const fieldErrors = useMemo(
    () => fieldErrorsOf(blocked ? null : query.error),
    [blocked, query.error]
  );

  const moveTo = useCallback(
    (last: number) =>
      setSearchParams(toSeriesSearchParams({ ...search, page: last }), {
        replace: true,
      }),
    [setSearchParams, search]
  );
  const overshooting = usePageClamp(
    {
      page: search.page,
      pageSize: search.pageSize,
      total: blocked ? undefined : query.data?.total,
    },
    moveTo
  );

  return {
    filterCount: seriesFilterCount(search),
    genres,
    form: {
      key: `${searchParams.toString()}|${genre?.id ?? ''}`,
      initialValues: seriesFormValuesOf(search, genre?.id),
      fieldErrors,
      // Page size is a filter of the search state: Search keeps the chosen
      // size, Reset drops it with the other filters (back to the default 20).
      onSearch: (values) =>
        setSearchParams(
          toSeriesSearchParams({
            ...seriesSearchOf(values),
            pageSize: search.pageSize,
          })
        ),
      onReset: () => setSearchParams({ tab: 'series' }),
    },
    list: {
      items: blocked ? [] : (query.data?.items ?? []),
      total: blocked ? 0 : (query.data?.total ?? 0),
      page: search.page,
      pageSize: search.pageSize,
      isPending: (!blocked && query.isPending) || overshooting,
      error: blocked ? null : query.error,
      filtered: seriesFilterCount(search) > 0,
      goToPage: (page, pageSize) =>
        setSearchParams(toSeriesSearchParams({ ...search, page, pageSize })),
    },
  };
};
