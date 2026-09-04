import { ApiError, request } from './client';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

describe('request', () => {
  it('prefixes /api and sends credentials so the sid cookie travels', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }));

    await request('/auth/me');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
  });

  it('serialises a body and sets the JSON content type', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }));

    await request('/auth/login', {
      method: 'POST',
      body: { login: 'bob', password: 'secret123' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"login":"bob","password":"secret123"}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('returns parsed JSON on success', async () => {
    mockFetch(jsonResponse({ id: 7, login: 'bob' }));

    await expect(request('/users/7')).resolves.toEqual({ id: 7, login: 'bob' });
  });

  it('returns undefined for 204 rather than choking on an empty body', async () => {
    mockFetch(emptyResponse(204));

    await expect(
      request('/auth/logout', { method: 'POST' })
    ).resolves.toBeUndefined();
  });

  it('returns undefined for an empty 202', async () => {
    mockFetch(emptyResponse(202));

    await expect(
      request('/auth/password-reset/request', {
        method: 'POST',
        body: { email: 'a@b.co' },
      })
    ).resolves.toBeUndefined();
  });

  it('throws ApiError carrying status, message and details', async () => {
    mockFetch(
      jsonResponse(
        { error: 'login is already taken', details: { field: 'login' } },
        409
      )
    );

    await expect(
      request('/auth/register', { method: 'POST', body: {} })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'login is already taken',
      details: { field: 'login' },
    });
  });

  it('throws ApiError even when the error body is not JSON', async () => {
    mockFetch(emptyResponse(502));

    const error = await request('/books').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });
});
