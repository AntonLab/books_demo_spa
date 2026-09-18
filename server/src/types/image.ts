// The accepted Cover/Avatar upload formats and byte ceiling are the client's
// contract too, so they live in the shared workspace (ADR-0006).
export {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  type AcceptedImageContentType,
  IMAGE_MAX_BYTES,
} from 'shared';
