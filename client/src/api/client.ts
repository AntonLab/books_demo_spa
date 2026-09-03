import type { ApiErrorBody } from '../types/api';

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

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

// A 204, and the 202 the reset-request endpoint answers with, carry no body at
// all. Parsing is attempted and its failure swallowed, so one code path covers
// "empty by design" and "error page that is not JSON".
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function errorFrom(
  status: number,
  parsed: unknown,
  fallback: string
): ApiError {
  if (typeof parsed === 'object' && parsed !== null) {
    const body = parsed as Partial<ApiErrorBody>;
    if (typeof body.error === 'string') {
      return new ApiError(status, body.error, body.details);
    }
  }
  return new ApiError(status, fallback);
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(`/api${path}`, {
    method,
    // Without this the browser withholds the httpOnly `sid` cookie and every
    // authenticated call silently fails as a 401.
    credentials: 'include',
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
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
}
