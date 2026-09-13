// The envelope of every paged list endpoint: one page of items, the total the
// filter matches, and the limit and offset the page was drawn with.
export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// The shape every error response from the server shares. `details` is
// deliberately `unknown`: it is a zod issue array on a 400 and
// `{ field: 'login' | 'email' }` on a 409, so callers must narrow it.
export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
