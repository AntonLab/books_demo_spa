import { clearReadingStatus, listLibrary, setReadingStatus } from './library';
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

describe('setReadingStatus', () => {
  it('puts the status for a book, with the XSRF token', async () => {
    const entry = {
      bookId: 7,
      status: 'reading',
      updatedAt: '2026-10-02T10:00:00.000Z',
    };
    const fetchMock = mockFetch(jsonResponse(entry));

    await expect(setReadingStatus(7, 'reading')).resolves.toEqual(entry);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/library/7');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
    expect(init.body).toBe('{"status":"reading"}');
  });
});

describe('clearReadingStatus', () => {
  it('deletes the status for a book and resolves to undefined', async () => {
    const fetchMock = mockFetch(emptyResponse(204));

    await expect(clearReadingStatus(7)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect([url, init.method]).toEqual(['/api/library/7', 'DELETE']);
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
