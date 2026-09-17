// The list envelope and the error body, from the shared workspace (ADR-0006).
// Neither carries a date, so neither needs Wire<>.
export type { ApiErrorBody, ListResponse } from 'shared';

// The accepted Cover/Avatar upload formats and the byte ceiling (P1). Neither
// carries a date, so neither needs Wire<>. The client checks both only to
// fail fast; the server is the real authority.
export {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  type AcceptedImageContentType,
} from 'shared';
