import {
  addSeriesCoAuthor,
  createSeries,
  deleteSeries,
  deleteSeriesCover,
  getSeries,
  listFavoritedSeries,
  listSeries,
  listSeriesBooks,
  removeBookFromSeries,
  removeSeriesCoAuthor,
  reorderSeriesBooks,
  updateSeries,
  uploadSeriesCover,
} from './series';
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
const envelope = { items: [], total: 0, limit: 20, offset: 0 };

describe('listSeries', () => {
  it('requests /api/series with no query string when given no params', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series');
    expect(init).toMatchObject({ method: 'GET' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('encodes userId and limit, in that order', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({ userId: 3, limit: 100 });

    expect(callOf(fetchMock)[0]).toBe('/api/series?userId=3&limit=100');
  });

  it('sends only the params it is given', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({ limit: 5 });

    expect(callOf(fetchMock)[0]).toBe('/api/series?limit=5');
  });

  it('narrows the list to one genre with genreId', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({ genreId: 4, limit: 20 });

    expect(callOf(fetchMock)[0]).toBe('/api/series?genreId=4&limit=20');
  });

  it('form-encodes the q term, so spaces and & cannot split the query', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({ q: 'Dark & Deep', limit: 8 });

    expect(callOf(fetchMock)[0]).toBe('/api/series?limit=8&q=Dark+%26+Deep');
  });

  it('returns the list envelope unchanged', async () => {
    const page = {
      items: [{ id: 2, title: 'Saga' }],
      total: 1,
      limit: 5,
      offset: 0,
    };
    mockFetch(page);

    await expect(listSeries({ limit: 5 })).resolves.toEqual(page);
  });
});

describe('listSeries sort and published', () => {
  it('encodes sort and published after the other params', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({
      userId: 3,
      limit: 20,
      offset: 40,
      sort: 'new',
      published: 'true',
    });

    expect(callOf(fetchMock)[0]).toBe(
      '/api/series?userId=3&limit=20&offset=40&sort=new&published=true'
    );
  });
});

describe('getSeries', () => {
  it('gets one series by id, with no body or token', async () => {
    const fetchMock = mockFetch({ id: 2, title: 'Saga' });

    await expect(getSeries(2)).resolves.toEqual({ id: 2, title: 'Saga' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('rejects with the 404 of a missing series', async () => {
    mockFetch({ error: 'Series 2 not found' }, 404);

    await expect(getSeries(2)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Series 2 not found',
    });
  });
});

describe('createSeries', () => {
  it('posts the fields as JSON with the XSRF token', async () => {
    const fetchMock = mockFetch({ id: 2 }, 201);

    await createSeries({ title: 'Saga', description: 'Long.', tags: ['epic'] });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'Saga',
      description: 'Long.',
      tags: ['epic'],
    });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('returns the created series from the 201', async () => {
    mockFetch({ id: 2, title: 'Saga', authors: [{ id: 3 }] }, 201);

    await expect(
      createSeries({ title: 'Saga', description: '', tags: [] })
    ).resolves.toEqual({ id: 2, title: 'Saga', authors: [{ id: 3 }] });
  });

  it('sends the chosen genre', async () => {
    const fetchMock = mockFetch({ id: 2 }, 201);

    await createSeries({
      title: 'Saga',
      description: 'Long.',
      tags: [],
      genreId: 4,
    });

    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({
      title: 'Saga',
      description: 'Long.',
      tags: [],
      genreId: 4,
    });
  });
});

describe('updateSeries', () => {
  it('patches only the fields it is given', async () => {
    const fetchMock = mockFetch({ id: 2 });

    await updateSeries(2, { title: 'Saga, Revised' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"title":"Saga, Revised"}');
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 403 the server gives a non-co-author', async () => {
    mockFetch({ error: 'You may only change series you co-author' }, 403);

    await expect(updateSeries(2, { title: 'x' })).rejects.toMatchObject({
      status: 403,
      message: 'You may only change series you co-author',
    });
  });

  it('patches the genre alone, and takes null for none', async () => {
    const fetchMock = mockFetch({ id: 2 });

    await updateSeries(2, { genreId: null });

    expect(callOf(fetchMock)[1].body).toBe('{"genreId":null}');
  });

  // Guards the safety-critical case: a payload that turned an absent key
  // into `null` would silently clear a Genre on a title-only save.
  it('leaves genreId off the wire when patching an unrelated field', async () => {
    const fetchMock = mockFetch({ id: 2 });

    await updateSeries(2, { title: 'x' });

    const body = JSON.parse(String(callOf(fetchMock)[1].body));
    expect('genreId' in body).toBe(false);
  });
});

describe('deleteSeries', () => {
  it('deletes by id with the token and no body, resolving on the 204', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(deleteSeries(2)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});

describe('addSeriesCoAuthor', () => {
  it('posts the account id to the series co-authors', async () => {
    const credited = { id: 2, authors: [{ id: 3 }, { id: 4 }] };
    const fetchMock = mockFetch(credited);

    await expect(addSeriesCoAuthor(2, 4)).resolves.toEqual(credited);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2/co-authors');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ userId: 4 });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 409 for an account already credited', async () => {
    mockFetch(
      { error: 'That account is already a co-author of this series' },
      409
    );

    await expect(addSeriesCoAuthor(2, 4)).rejects.toMatchObject({
      status: 409,
      message: 'That account is already a co-author of this series',
    });
  });
});

describe('removeSeriesCoAuthor', () => {
  it('deletes the credit named by both ids, with no body', async () => {
    const fetchMock = mockFetch({ id: 2, authors: [{ id: 3 }] });

    await expect(removeSeriesCoAuthor(2, 4)).resolves.toEqual({
      id: 2,
      authors: [{ id: 3 }],
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2/co-authors/4');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });

  it('rejects with the 409 when the last co-author tries to leave', async () => {
    mockFetch(
      { error: 'The last co-author cannot leave; delete the series instead' },
      409
    );

    await expect(removeSeriesCoAuthor(2, 3)).rejects.toMatchObject({
      status: 409,
      message: 'The last co-author cannot leave; delete the series instead',
    });
  });
});

describe('listSeriesBooks', () => {
  it('gets the books filed in the series, with no body or token', async () => {
    const fetchMock = mockFetch({ items: [] });

    await listSeriesBooks(2);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2/books');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('returns the items wrapper as sent, with no paging fields', async () => {
    const books = { items: [{ id: 5, title: 'One', status: 'draft' }] };
    mockFetch(books);

    await expect(listSeriesBooks(2)).resolves.toEqual(books);
  });
});

describe('reorderSeriesBooks', () => {
  it('puts the whole Series order, first book first', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(reorderSeriesBooks(2, [6, 5, 7])).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2/book-order');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ bookIds: [6, 5, 7] });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 409 when the books changed since loading', async () => {
    mockFetch(
      { error: 'The books of this series changed since you loaded them' },
      409
    );

    // The status is what the editor branches on to reload and explain.
    await expect(reorderSeriesBooks(2, [6, 5])).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'The books of this series changed since you loaded them',
    });
  });
});

describe('removeBookFromSeries', () => {
  it('deletes the book from the series by both ids, with no body', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(removeBookFromSeries(2, 5)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/2/books/5');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});

describe('listSeries paging, tag and favorites', () => {
  it('encodes tag and offset, keeping an offset of 0', async () => {
    const fetchMock = mockFetch(envelope);

    await listSeries({ tag: 'epic', limit: 20, offset: 0 });

    const url = new URL(callOf(fetchMock)[0], 'http://x');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tag: 'epic',
      limit: '20',
      offset: '0',
    });
  });

  it('listFavoritedSeries sends favoritedBy=me beside the other filters', async () => {
    const fetchMock = mockFetch(envelope);

    await listFavoritedSeries({ genreId: 4, limit: 50, offset: 50 });

    const url = new URL(callOf(fetchMock)[0], 'http://x');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      genreId: '4',
      limit: '50',
      offset: '50',
      favoritedBy: 'me',
    });
  });
});

describe('uploadSeriesCover', () => {
  it('PUTs the file as-is to /series/:id/cover and returns the series', async () => {
    const fetchMock = mockFetch({
      id: 12,
      coverUrl: '/api/series/12/cover?v=2',
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.webp', {
      type: 'image/webp',
    });

    const result = await uploadSeriesCover(12, file);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/12/cover');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'image/webp'
    );
    expect((init.headers as Record<string, string>)['X-XSRF-Token']).toBe(
      'tok-123'
    );
    expect(result.coverUrl).toBe('/api/series/12/cover?v=2');
  });
});

describe('deleteSeriesCover', () => {
  it('DELETEs /series/:id/cover with no body', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await deleteSeriesCover(12);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/series/12/cover');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});
