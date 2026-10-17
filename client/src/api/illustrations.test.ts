import {
  deleteIllustration,
  listIllustrations,
  reorderIllustrations,
  updateIllustrationCaption,
  uploadIllustration,
} from './illustrations';
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

describe('illustrations api', () => {
  it("lists a chapter's illustrations with a plain GET", async () => {
    const fetchMock = mockFetch({ items: [] });
    await expect(listIllustrations(9)).resolves.toEqual({ items: [] });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9/illustrations');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('posts the file as-is under the chapter, with its own content type', async () => {
    const row = {
      id: 5,
      position: 1,
      caption: null,
      updatedAt: '2026-10-17T00:00:00.000Z',
    };
    const fetchMock = mockFetch(row, 201);
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    await expect(uploadIllustration(9, file)).resolves.toEqual(row);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9/illustrations');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(file);
    expect(init.headers).toEqual({
      'Content-Type': 'image/png',
      'X-XSRF-Token': 'tok-123',
    });
  });

  it('patches a caption, null clears it', async () => {
    const fetchMock = mockFetch({
      id: 5,
      position: 1,
      caption: null,
      updatedAt: 'x',
    });
    await updateIllustrationCaption(5, null);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/illustrations/5');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ caption: null });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('puts the whole order under the chapter and returns the list', async () => {
    const fetchMock = mockFetch({ items: [] });
    await expect(reorderIllustrations(9, [3, 1, 2])).resolves.toEqual({
      items: [],
    });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/chapters/9/illustration-order');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      illustrationIds: [3, 1, 2],
    });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects a stale order with the 409', async () => {
    mockFetch({ error: 'The illustrations changed' }, 409);
    await expect(reorderIllustrations(9, [1])).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
    });
  });

  it('deletes by id and resolves on the empty 204', async () => {
    const fetchMock = mockFetch(undefined, 204);
    await expect(deleteIllustration(5)).resolves.toBeUndefined();
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/illustrations/5');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});
