import { listNotifications, markNotificationsRead } from './notifications';
import { jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock): [string, RequestInit] => {
  return fetchMock.mock.calls[0] as [string, RequestInit];
};

// Every write must echo the session's token, so each test runs with one set.
// A read carrying it, or a write missing it, then shows up in `headers`.
beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('listNotifications', () => {
  it('gets the newest page, with no body, token or account id', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ items: [], total: 0, unread: 0, limit: 20, offset: 0 })
    );

    await listNotifications();

    const [url, init] = callOf(fetchMock);
    // No userId: whose notifications is the session's to decide.
    expect(url).toBe('/api/notifications?limit=20');
    expect(init).toMatchObject({ method: 'GET' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('returns the page with its unread count', async () => {
    const page = {
      items: [{ id: 4, kind: 'co_author_added', isRead: false }],
      total: 1,
      unread: 1,
      limit: 20,
      offset: 0,
    };
    mockFetch(jsonResponse(page));

    await expect(listNotifications()).resolves.toEqual(page);
  });

  it('rejects with the 401 a signed-out caller gets', async () => {
    mockFetch(jsonResponse({ error: 'Authentication required' }, 401));

    await expect(listNotifications()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Authentication required',
    });
  });
});

describe('markNotificationsRead', () => {
  it('posts the ids seen as JSON with the XSRF token', async () => {
    const fetchMock = mockFetch(jsonResponse({ unread: 0 }));

    await markNotificationsRead([4, 5]);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/notifications/read');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ ids: [4, 5] });
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
  });

  it('returns how many are still unread', async () => {
    mockFetch(jsonResponse({ unread: 2 }));

    await expect(markNotificationsRead([4])).resolves.toEqual({ unread: 2 });
  });

  it('rejects with the 403 a write with a stale token gets', async () => {
    mockFetch(jsonResponse({ error: 'Missing or invalid CSRF token' }, 403));

    await expect(markNotificationsRead([4])).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Missing or invalid CSRF token',
    });
  });
});
