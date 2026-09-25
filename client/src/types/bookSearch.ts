import dayjs, { type Dayjs } from 'dayjs';
import { ApiError } from '../api/client';
import type { ListBooksParams } from '../api/books';
import type { BookSort, SearchableBookStatus } from 'shared';
import { BOOK_SORTS, SEARCHABLE_BOOK_STATUSES } from 'shared';

const SEARCH_PAGE_SIZE = 20;

const TEXT_KEYS = ['q', 'author', 'seriesTitle'] as const;
// A picked suggestion's id beside the text it filled in: the server filters by
// the id, the field shows the text, and neither counts without the other.
const ID_KEYS = { authorId: 'author', seriesId: 'seriesTitle' } as const;
type IdKey = keyof typeof ID_KEYS;
const ID_KEY_LIST = Object.keys(ID_KEYS) as IdKey[];
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
  authorId?: number;
  seriesTitle?: string;
  seriesId?: number;
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
  // Set by picking a suggestion, cleared by typing; hidden fields.
  authorId?: number;
  seriesTitle?: string;
  seriesId?: number;
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

const idOf = (value: string | null): number | undefined =>
  value !== null && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : undefined;

// Anything the page cannot use — an unknown status or sort, an impossible
// day, a page below 2, an id without its text — reads as empty. `?series=` is
// not read at all.
export const parseBookSearch = (params: URLSearchParams): BookSearch => {
  const search: BookSearch = { sort: 'popular', page: 1 };
  for (const key of TEXT_KEYS) {
    const value = params.get(key)?.trim();
    if (value) search[key] = value;
  }
  for (const key of ID_KEY_LIST) {
    const id = idOf(params.get(key));
    if (id !== undefined && search[ID_KEYS[key]] !== undefined) {
      search[key] = id;
    }
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
  for (const key of ID_KEY_LIST) {
    const id = search[key];
    if (id !== undefined) params.set(key, String(id));
  }
  if (search.sort !== 'popular') params.set('sort', search.sort);
  if (search.page > 1) params.set('page', String(search.page));
  return params;
};

// Every link into the search page. Spaces go out as %20 rather than the `+`
// URLSearchParams writes, as the hand-built links always did; a literal `+`
// is written as %2B, so each `+` left is a space.
export const searchPath = (search: Partial<BookSearch>): string => {
  const query = toSearchParams({
    ...search,
    sort: search.sort ?? 'popular',
    page: search.page ?? 1,
  })
    .toString()
    .replace(/\+/g, '%20');
  return query === '' ? '/search' : `/search?${query}`;
};

// The rest maps the search to the form and the request, and is useSearchPage's
// alone: every other caller goes through parseBookSearch, toSearchParams or
// searchPath. Tested through that hook.
// Every Search starts at page 1.
export const searchOf = (values: BookSearchFormValues): BookSearch => {
  const search: BookSearch = { sort: values.sort, page: 1 };
  for (const key of TEXT_KEYS) {
    const value = values[key]?.trim();
    if (value) search[key] = value;
  }
  for (const key of ID_KEY_LIST) {
    const id = values[key];
    if (id !== undefined && search[ID_KEYS[key]] !== undefined) {
      search[key] = id;
    }
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
  authorId: search.authorId,
  seriesTitle: search.seriesTitle,
  seriesId: search.seriesId,
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
  // A picked author or series is asked for by id alone, so a namesake whose
  // login or title merely holds the text is not found with it.
  ...(search.authorId === undefined
    ? { author: search.author }
    : { userId: search.authorId }),
  ...(search.seriesId === undefined
    ? { seriesTitle: search.seriesTitle }
    : { seriesId: search.seriesId }),
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

// The API names the form's fields as the form does, but for the Genre select,
// which sends `genreId`, and a picked author or series, sent as `userId` /
// `seriesId`; `current` / `pageSize` have no field to show an error on.
const SAME_NAME_FIELDS: readonly string[] = [
  ...TEXT_KEYS,
  'status',
  ...DAY_KEYS,
  'sort',
];

const fieldOfParam = (
  param: unknown
): keyof BookSearchFormValues | undefined => {
  if (param === 'genreId') return 'genre';
  if (param === 'userId') return 'author';
  if (param === 'seriesId') return 'seriesTitle';
  return typeof param === 'string' && SAME_NAME_FIELDS.includes(param)
    ? (param as keyof BookSearchFormValues)
    : undefined;
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
    const name = fieldOfParam(head);
    return name !== undefined && typeof message === 'string'
      ? [{ name, errors: [message] }]
      : [];
  });
};
