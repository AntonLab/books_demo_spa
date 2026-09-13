import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  reorderChapters,
  updateChapter,
} from './chapters';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

// A 204 carries no body, so it gets the fixture whose json() rejects.
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
// A read carrying it, or a write missing it, then shows up in `headers`.
beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const jsonWrite = {
  'Content-Type': 'application/json',
  'X-XSRF-Token': 'tok-123',
};

describe('listChapters', () => {
  it('requests one book at the server maximum page size', async () => {
    const fetchMock = mockFetch({ items: [], total: 0, limit: 100, offset: 0 });

    await listChapters(7);

    const [url, init] = callOf(fetchMock);
    // 100 is the server's cap on limit; anything above is a 400.
    expect(url).toBe('/api/chapters?bookId=7&limit=100');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('returns the list envelope unchanged', async () => {
    const page = {
      items: [{ id: 9, title: 'One', publishedAt: null }],
      total: 1,
      limit: 100,
      offset: 0,
    };
    mockFetch(page);

    await expect(listChapters(7)).resolves.toEqual(page);
  });
});

describe('getChapter', () => {
  it('gets one chapter by id, with no body or token', async () => {
    const fetchMock = mockFetch({ id: 9, text: 'Once.' });

    await expect(getChapter(9)).resolves.toEqual({ id: 9, text: 'Once.' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('rejects with the 404 of a chapter not yet out', async () => {
    mockFetch({ error: 'Chapter 9 not found' }, 404);

    await expect(getChapter(9)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Chapter 9 not found',
    });
  });
});

describe('createChapter', () => {
  it('posts the book, fields and Publication time with the XSRF token', async () => {
    const fetchMock = mockFetch({ id: 9 }, 201);

    await createChapter({
      bookId: 7,
      title: 'One',
      text: 'Once.',
      publishedAt: 'now',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      bookId: 7,
      title: 'One',
      text: 'Once.',
      publishedAt: 'now',
    });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('keeps a draft as an explicit null rather than dropping the key', async () => {
    const fetchMock = mockFetch({ id: 9 }, 201);

    await createChapter({
      bookId: 7,
      title: 'One',
      text: 'x',
      publishedAt: null,
    });

    expect(callOf(fetchMock)[1].body).toBe(
      '{"bookId":7,"title":"One","text":"x","publishedAt":null}'
    );
  });

  it('returns the created chapter from the 201', async () => {
    mockFetch({ id: 9, publishedAt: '2026-09-02T00:00:00.000Z' }, 201);

    await expect(
      createChapter({
        bookId: 7,
        title: 'One',
        text: 'x',
        publishedAt: '2026-09-02T00:00:00.000Z',
      })
    ).resolves.toEqual({ id: 9, publishedAt: '2026-09-02T00:00:00.000Z' });
  });
});

describe('updateChapter', () => {
  it('patches the fields with the version the save was based on', async () => {
    const fetchMock = mockFetch({ id: 9 });

    await updateChapter(9, {
      text: 'Revised.',
      expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9');
    expect(init.method).toBe('PATCH');
    // No publishedAt key at all: omitting it is what keeps a Published
    // chapter's time, and the server refuses any other value but null.
    expect(init.body).toBe(
      '{"text":"Revised.","expectedUpdatedAt":"2026-09-01T00:00:00.000Z"}'
    );
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 409 when a co-author saved first', async () => {
    mockFetch({ error: 'This chapter was changed since you loaded it' }, 409);

    await expect(
      updateChapter(9, {
        title: 'x',
        expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
      })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'This chapter was changed since you loaded it',
    });
  });
});

describe('deleteChapter', () => {
  it('deletes by id with the token and no body, resolving on the 204', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(deleteChapter(9)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});

describe('reorderChapters', () => {
  it("puts the book's whole Reading order under /books, first chapter first", async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(reorderChapters(7, [2, 1, 3])).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7/chapter-order');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ chapterIds: [2, 1, 3] });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 409 when a chapter was added or deleted since loading', async () => {
    mockFetch(
      { error: 'The chapters of this book changed since you loaded them' },
      409
    );

    // The status is what EditBookPage branches on to reload and explain.
    await expect(reorderChapters(7, [2, 1])).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'The chapters of this book changed since you loaded them',
    });
  });
});
