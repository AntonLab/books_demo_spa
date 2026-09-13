import { createLike, deleteLike } from './likes';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock): [string, RequestInit] => {
  return fetchMock.mock.calls[0] as [string, RequestInit];
};

// Both calls are writes, which must echo the session's token.
beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('createLike', () => {
  it('posts a book like as JSON with the XSRF token', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }, 201));

    await createLike({ bookId: 7, isLike: true });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/likes');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
    // Exactly one target and no userId: the server takes the liker from the
    // session and refuses a body naming both a book and a comment.
    expect(init.body).toBe('{"bookId":7,"isLike":true}');
  });

  it('posts a comment like with the comment as its only target', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 2 }, 201));

    await createLike({ commentId: 5, isLike: true });

    expect(callOf(fetchMock)[1].body).toBe('{"commentId":5,"isLike":true}');
  });

  it('returns the created like, whose id a second click deletes', async () => {
    const like = { id: 1, userId: 3, bookId: 7, commentId: null, isLike: true };
    mockFetch(jsonResponse(like, 201));

    await expect(createLike({ bookId: 7, isLike: true })).resolves.toEqual(
      like
    );
  });

  it('rejects with the 409 for a target already liked', async () => {
    mockFetch(
      jsonResponse(
        { error: 'like is already taken', details: { field: 'like' } },
        409
      )
    );

    await expect(createLike({ bookId: 7, isLike: true })).rejects.toMatchObject(
      {
        name: 'ApiError',
        status: 409,
        message: 'like is already taken',
        details: { field: 'like' },
      }
    );
  });
});

describe('deleteLike', () => {
  it('deletes by id with the token and no body, resolving on the 204', async () => {
    const fetchMock = mockFetch(emptyResponse(204));

    await expect(deleteLike(1)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/likes/1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });

  it('rejects with the 403 for a like someone else made', async () => {
    mockFetch(
      jsonResponse({ error: 'You may only change your own likes' }, 403)
    );

    await expect(deleteLike(1)).rejects.toMatchObject({
      status: 403,
      message: 'You may only change your own likes',
    });
  });
});
