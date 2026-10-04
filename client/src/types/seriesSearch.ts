import type { ListSeriesParams } from '../api/series';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';
import { pagingOf, type BookSearchFormValues } from './bookSearch';

// The Series tab's state as its URL holds it. `genre` is kept raw, like
// BookSearch.genre.
interface SeriesSearch {
  q?: string;
  genre?: string;
  tag?: string;
  page: number;
  pageSize: number;
}

const trimmed = (value: string | null | undefined): string | undefined =>
  value?.trim() || undefined;

export const parseSeriesSearch = (params: URLSearchParams): SeriesSearch => {
  const search: SeriesSearch = pagingOf(params);
  const q = trimmed(params.get('q'));
  const genre = trimmed(params.get('genre'));
  const tag = trimmed(params.get('tag'));
  if (q) search.q = q;
  if (genre) search.genre = genre;
  if (tag) search.tag = tag;
  return search;
};

// Only what is set, after `tab=series`; page 1 and the default size are left out.
export const toSeriesSearchParams = (search: SeriesSearch): URLSearchParams => {
  const params = new URLSearchParams({ tab: 'series' });
  for (const key of ['q', 'genre', 'tag'] as const) {
    const value = search[key];
    if (value !== undefined) params.set(key, value);
  }
  if (search.page > 1) params.set('page', String(search.page));
  if (search.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(search.pageSize));
  }
  return params;
};

// Every Search starts at page 1.
export const seriesSearchOf = (values: BookSearchFormValues): SeriesSearch => {
  const search: SeriesSearch = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
  const q = trimmed(values.q);
  const tag = trimmed(values.tag);
  if (q) search.q = q;
  if (tag) search.tag = tag;
  if (values.genre !== undefined) search.genre = String(values.genre);
  return search;
};

// `sort` is the form value type's required field; the series form has no sort
// field, so callers ignore it.
export const seriesFormValuesOf = (
  search: SeriesSearch,
  genreId: number | undefined
): BookSearchFormValues => ({
  q: search.q,
  tag: search.tag,
  genre: genreId,
  sort: 'popular',
});

export const seriesListParamsOf = (
  search: SeriesSearch,
  genreId: number | undefined
): ListSeriesParams => ({
  q: search.q,
  genreId,
  tag: search.tag,
  limit: search.pageSize,
  offset: (search.page - 1) * search.pageSize,
});

export const seriesFilterCount = (search: SeriesSearch): number =>
  [search.q, search.genre, search.tag].filter((value) => value !== undefined)
    .length;
