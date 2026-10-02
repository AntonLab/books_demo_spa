import { ApiError } from '@/api/client';

export interface AccountFieldError {
  name: string;
  errors: string[];
}

const TAKEN_FIELDS = ['login', 'email'];

// `null` means the error belongs to no field: show `error.message` in an Alert.
export const accountFieldErrors = (
  error: unknown
): AccountFieldError[] | null => {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 409) {
    const { field } = (error.details ?? {}) as { field?: unknown };
    return typeof field === 'string' && TAKEN_FIELDS.includes(field)
      ? [{ name: field, errors: [`This ${field} is already taken.`] }]
      : null;
  }

  if (
    error.status === 403 &&
    error.message === 'Current password is incorrect'
  ) {
    return [{ name: 'currentPassword', errors: [error.message] }];
  }

  if (error.status === 400 && Array.isArray(error.details)) {
    const found = error.details.flatMap(
      (issue: unknown): AccountFieldError[] => {
        const { path, message } = (issue ?? {}) as {
          path?: unknown;
          message?: unknown;
        };
        const head: unknown = Array.isArray(path) ? path[0] : undefined;
        return typeof head === 'string' && typeof message === 'string'
          ? [{ name: head, errors: [message] }]
          : [];
      }
    );
    return found.length > 0 ? found : null;
  }

  return null;
};
