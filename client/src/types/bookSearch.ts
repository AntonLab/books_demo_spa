import dayjs, { type Dayjs } from 'dayjs';
import { ApiError } from '../api/client';
import type { ListBooksParams } from '../api/books';
import {
  BOOK_SORTS,
  RANGE_ORDER,
  SEARCHABLE_BOOK_STATUSES,
  type BookSort,
  type SearchableBookStatus,
} from './book';

export const SEARCH_PAGE_SIZE = 20;

// Re-exported so SearchForm can still import it from here; the value itself
// now lives in shared/src/book.ts, next to the server's own copy.
export { RANGE_ORDER };

const TEXT_KEYS = ['q', 'author', 'seriesTitle'] as const;
const DAY_KEYS = [
  'releasedFrom',
  'releasedTo',
  'updatedFrom',
  'updatedTo',
] as const;
const DAY_FORMAT = 'YYYY-MM-DD';

// The search page's state as its URL holds it, one key per form field. Days
// stay calendar days (`YYYY-MM-DD`) and become instants only on the way to
// the server, so a link means the same days wherever it is opened. `genre` is
// kept raw: whether it names a Genre is known only once the Genre list is in.
export interface BookSearch {
  q?: string;
  author?: string;
  seriesTitle?: string;
  genre?: string;
  status?: SearchableBookStatus;
  releasedFrom?: string;
  releasedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sort: BookSort;
  page: number;
}

// What the antd form holds: pickers take Dayjs, the Genre select an id.
export interface BookSearchFormValues {
  q?: string;
  author?: string;
  seriesTitle?: string;
  genre?: number;
  status?: SearchableBookStatus;
  releasedFrom?: Dayjs | null;
  releasedTo?: Dayjs | null;
  updatedFrom?: Dayjs | null;
  updatedTo?: Dayjs | null;
  sort: BookSort;
}

export interface SearchFieldError {
  name: keyof BookSearchFormValues;
  errors: string[];
}

const isOneOf = <T extends string>(
  options: readonly T[],
  value: string | null
): value is T => (options as readonly (string | null)[]).includes(value);

// dayjs rolls an impossible day over (2026-02-30 becomes 2026-03-02), so a
// day that does not format back to itself was never a day.
const isDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  dayjs(value).format(DAY_FORMAT) === value;

// Anything the page cannot use — an unknown status or sort, an impossible
// day, a page below 2 — reads as empty. `?series=` is not read at all.
export const parseBookSearch = (params: URLSearchParams): BookSearch => {
  const search: BookSearch = { sort: 'popular', page: 1 };
  for (const key of TEXT_KEYS) {
    const value = params.get(key)?.trim();
    if (value) search[key] = value;
  }
  const genre = params.get('genre')?.trim();
  if (genre) search.genre = genre;
  const status = params.get('status');
  if (isOneOf(SEARCHABLE_BOOK_STATUSES, status)) search.status = status;
  for (const key of DAY_KEYS) {
    const value = params.get(key);
    if (value !== null && isDay(value)) search[key] = value;
  }
  const sort = params.get('sort');
  if (isOneOf(BOOK_SORTS, sort)) search.sort = sort;
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 1) search.page = page;
  return search;
};

// Only what is set; the default sort and page 1 are left out, so an empty
// form is a bare /search.
export const toSearchParams = (search: BookSearch): URLSearchParams => {
  const params = new URLSearchParams();
  for (const key of [...TEXT_KEYS, 'genre', 'status', ...DAY_KEYS] as const) {
    const value = search[key];
    if (value !== undefined) params.set(key, value);
  }
  if (search.sort !== 'popular') params.set('sort', search.sort);
  if (search.page > 1) params.set('page', String(search.page));
  return params;
};

// Every Search starts at page 1.
export const searchOf = (values: BookSearchFormValues): BookSearch => {
  const search: BookSearch = { sort: values.sort, page: 1 };
  for (const key of TEXT_KEYS) {
    const value = values[key]?.trim();
    if (value) search[key] = value;
  }
  if (values.genre !== undefined) search.genre = String(values.genre);
  if (values.status !== undefined) search.status = values.status;
  for (const key of DAY_KEYS) {
    const value = values[key];
    if (value) search[key] = value.format(DAY_FORMAT);
  }
  return search;
};

const dayOf = (value: string | undefined): Dayjs | null =>
  value === undefined ? null : dayjs(value);

// `genreId` is the Genre the URL's `genre` resolved to, or undefined when it
// names none, which leaves the field empty.
export const formValuesOf = (
  search: BookSearch,
  genreId: number | undefined
): BookSearchFormValues => ({
  q: search.q,
  author: search.author,
  seriesTitle: search.seriesTitle,
  genre: genreId,
  status: search.status,
  releasedFrom: dayOf(search.releasedFrom),
  releasedTo: dayOf(search.releasedTo),
  updatedFrom: dayOf(search.updatedFrom),
  updatedTo: dayOf(search.updatedTo),
  sort: search.sort,
});

// Both bounds inclusive, in the browser's time zone: a "from" day starts at
// its first instant and a "to" day ends at its last.
const startOf = (day: string | undefined): string | undefined =>
  day === undefined ? undefined : dayjs(day).startOf('day').toISOString();
const endOf = (day: string | undefined): string | undefined =>
  day === undefined ? undefined : dayjs(day).endOf('day').toISOString();

export const listParamsOf = (
  search: BookSearch,
  genreId: number | undefined
): ListBooksParams => ({
  q: search.q,
  author: search.author,
  seriesTitle: search.seriesTitle,
  genreId,
  status: search.status,
  releasedFrom: startOf(search.releasedFrom),
  releasedTo: endOf(search.releasedTo),
  updatedFrom: startOf(search.updatedFrom),
  updatedTo: endOf(search.updatedTo),
  sort: search.sort,
  current: search.page,
  pageSize: SEARCH_PAGE_SIZE,
});

// The filters set, for the collapsed form's header. A range counts once,
// whichever of its ends is set; the sort is not a filter.
export const filterCount = (search: BookSearch): number =>
  [
    search.q,
    search.author,
    search.seriesTitle,
    search.genre,
    search.status,
    search.releasedFrom ?? search.releasedTo,
    search.updatedFrom ?? search.updatedTo,
  ].filter((value) => value !== undefined).length;

// The API's names for the form's fields. Two differ: the Genre select sends
// `genreId`, and `current` / `pageSize` have no field to show an error on.
const FIELD_OF_PARAM: Partial<Record<string, keyof BookSearchFormValues>> = {
  q: 'q',
  author: 'author',
  seriesTitle: 'seriesTitle',
  genreId: 'genre',
  status: 'status',
  releasedFrom: 'releasedFrom',
  releasedTo: 'releasedTo',
  updatedFrom: 'updatedFrom',
  updatedTo: 'updatedTo',
  sort: 'sort',
};

// A 400 carries zod's issues in `details`; each lands on the field it names.
export const fieldErrorsOf = (error: unknown): SearchFieldError[] => {
  if (
    !(error instanceof ApiError) ||
    error.status !== 400 ||
    !Array.isArray(error.details)
  ) {
    return [];
  }
  return error.details.flatMap((issue: unknown): SearchFieldError[] => {
    if (typeof issue !== 'object' || issue === null) return [];
    const { path, message } = issue as { path?: unknown; message?: unknown };
    const [head]: unknown[] = Array.isArray(path) ? path : [];
    const name = typeof head === 'string' ? FIELD_OF_PARAM[head] : undefined;
    return name !== undefined && typeof message === 'string'
      ? [{ name, errors: [message] }]
      : [];
  });
};
