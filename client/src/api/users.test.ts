import { deleteAvatar, uploadAvatar } from './users';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (body: unknown, status = 200): jest.Mock => {
  const response =
    status === 204 ? emptyResponse(status) : jsonResponse(body, status);
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock): [string, RequestInit] => {
  return fetchMock.mock.calls[0] as [string, RequestInit];
};

// Every write must echo the session's token, so each test runs with one set.
beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('uploadAvatar', () => {
  it('PUTs the file as-is to /users/:id/avatar, with the XSRF token', async () => {
    const fetchMock = mockFetch({
      id: 7,
      avatarUrl: '/api/users/7/avatar?v=2',
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'me.webp', {
      type: 'image/webp',
    });

    await uploadAvatar(7, file);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/users/7/avatar');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    expect(init.headers).toEqual({
      'Content-Type': 'image/webp',
      'X-XSRF-Token': 'tok-123',
    });
  });
});

describe('deleteAvatar', () => {
  it('DELETEs /users/:id/avatar with no body', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await deleteAvatar(7);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/users/7/avatar');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});
