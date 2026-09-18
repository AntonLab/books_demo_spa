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

// P1 (docs/superpowers/specs/2026-09-14-covers-and-avatars-design.md): the
// three formats a Cover or Avatar upload must decode as, and the request
// body's byte ceiling. The server checks both for real; the client uses
// them only to fail fast before the request leaves.
export const ACCEPTED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AcceptedImageContentType =
  (typeof ACCEPTED_IMAGE_CONTENT_TYPES)[number];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
