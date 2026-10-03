import { createFavorite, deleteFavorite } from './favorites';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock): [string, RequestInit] => {
  return fetchMock.mock.calls[0] as [string, RequestInit];
};

// The writes must echo the session's token; the reads must not carry it.
beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('createFavorite', () => {
  it('posts a book as the only target, with the XSRF token', async () => {
    const favorite = {
      id: 5,
      userId: 9,
      bookId: 7,
      seriesId: null,
      createdAt: '2026-09-26T10:00:00.000Z',
    };
    const fetchMock = mockFetch(jsonResponse(favorite, 201));

    await expect(createFavorite({ bookId: 7 })).resolves.toEqual(favorite);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/favorites');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
    expect(init.body).toBe('{"bookId":7}');
  });

  it('posts a series as the only target', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 6 }, 201));

    await createFavorite({ seriesId: 12 });

    expect(callOf(fetchMock)[1].body).toBe('{"seriesId":12}');
  });

  it('rejects with the 409 of a work that is already a Favorite', async () => {
    mockFetch(jsonResponse({ error: 'favorite is already taken' }, 409));

    await expect(createFavorite({ bookId: 7 })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('deleteFavorite', () => {
  it('deletes the Favorite by its own id, with the XSRF token', async () => {
    const fetchMock = mockFetch(emptyResponse(204));

    await expect(deleteFavorite(5)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/favorites/5');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});
