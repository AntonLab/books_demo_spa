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
