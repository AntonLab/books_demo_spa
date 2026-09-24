import type { ApiErrorBody } from 'shared';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

// A 204, and the 202 the reset-request endpoint answers with, carry no body at
// all. Parsing is attempted and its failure swallowed, so one code path covers
// "empty by design" and "error page that is not JSON".
const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
};

const errorFrom = (
  status: number,
  parsed: unknown,
  fallback: string
): ApiError => {
  if (typeof parsed === 'object' && parsed !== null) {
    const body = parsed as Partial<ApiErrorBody>;
    if (typeof body.error === 'string') {
      return new ApiError(status, body.error, body.details);
    }
  }
  return new ApiError(status, fallback);
};

// The session's XSRF token, which the server sets in a cookie a script can read
// whenever it opens a session. Every write echoes it in the X-XSRF-Token header:
// a page on another site can make the browser send the cookie, but can neither
// read it nor set the header, so the server refuses its forged writes. Reads
// carry none, and a visitor with no session has no token to send.
const xsrfToken = (): string | undefined => {
  const match = document.cookie.match(/(?:^|;\s*)xsrfToken=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

export const request = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { method = 'GET', body, signal } = options;
  const token = method === 'GET' ? undefined : xsrfToken();
  // A File is a Blob — a Cover/Avatar upload sends it as-is, with its own
  // content type, and never JSON.stringify'd. Every other body keeps the
  // JSON path.
  const isBlobBody = body instanceof Blob;
  const headers = {
    ...(body === undefined
      ? {}
      : { 'Content-Type': isBlobBody ? body.type : 'application/json' }),
    ...(token === undefined ? {} : { 'X-XSRF-Token': token }),
  };

  const response = await fetch(`/api${path}`, {
    method,
    // Without this the browser withholds the httpOnly `sid` cookie and every
    // authenticated call silently fails as a 401.
    credentials: 'include',
    headers: Object.keys(headers).length === 0 ? undefined : headers,
    body:
      body === undefined ? undefined : isBlobBody ? body : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw errorFrom(
      response.status,
      await readJson(response),
      response.statusText || 'Request failed'
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await readJson(response)) as T;
};
