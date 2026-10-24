import {
  addBookToLibrary,
  addSeriesToLibrary,
  clearReadingStatus,
  listLibrary,
  postReadingProgress,
  removeSeriesFromLibrary,
  toggleBookNotInterested,
  toggleSeriesNotInterested,
} from './library';
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

describe('clearReadingStatus', () => {
  it('deletes the status for a book and resolves to undefined', async () => {
    const fetchMock = mockFetch(emptyResponse(204));

    await expect(clearReadingStatus(7)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual(['/api/library/7', 'DELETE']);
  });
});

describe('postReadingProgress', () => {
  it('posts the payload to /books/5/reading-progress and resolves to undefined', async () => {
    const fetchMock = mockFetch(emptyResponse(204));

    await expect(
      postReadingProgress(5, { event: 'opened', chapterId: 12 })
    ).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual([
      '/api/books/5/reading-progress',
      'POST',
    ]);
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
    expect(init.body).toBe('{"event":"opened","chapterId":12}');
  });
});

describe('addBookToLibrary', () => {
  it('posts /library/7/add and resolves to the state', async () => {
    const state = { bookId: 7, status: 'plan_to_read' };
    const fetchMock = mockFetch(jsonResponse(state));

    await expect(addBookToLibrary(7)).resolves.toEqual(state);

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual(['/api/library/7/add', 'POST']);
  });
});

describe('toggleBookNotInterested', () => {
  it('posts /library/7/not-interested', async () => {
    const state = { bookId: 7, status: null };
    const fetchMock = mockFetch(jsonResponse(state));

    await expect(toggleBookNotInterested(7)).resolves.toEqual(state);

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual([
      '/api/library/7/not-interested',
      'POST',
    ]);
  });
});

describe('Series Library calls', () => {
  const state = { inLibrary: true, notInterested: false };

  it.each([
    [
      'addSeriesToLibrary',
      addSeriesToLibrary,
      '/api/library/series/5/add',
      'POST',
    ],
    [
      'toggleSeriesNotInterested',
      toggleSeriesNotInterested,
      '/api/library/series/5/not-interested',
      'POST',
    ],
    [
      'removeSeriesFromLibrary',
      removeSeriesFromLibrary,
      '/api/library/series/5',
      'DELETE',
    ],
  ])('%s sends %s %s', async (_name, call, path, method) => {
    const fetchMock = mockFetch(jsonResponse(state));

    await expect(call(5)).resolves.toEqual(state);

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual([path, method]);
  });
});

describe('listLibrary', () => {
  it('sends only the params it was given', async () => {
    const page = { items: [], total: 0, current: 2, pageSize: 50 };
    const fetchMock = mockFetch(jsonResponse(page));

    await expect(
      listLibrary({ status: 'read', current: 2, pageSize: 50 })
    ).resolves.toEqual(page);

    expect(callOf(fetchMock)[0]).toBe(
      '/api/library?status=read&current=2&pageSize=50'
    );
  });

  it('asks for the bare path with no params', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ items: [], total: 0, current: 1, pageSize: 20 })
    );

    await listLibrary();

    expect(callOf(fetchMock)[0]).toBe('/api/library');
  });
});
