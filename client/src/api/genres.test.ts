import { createGenre, deleteGenre, listGenres, renameGenre } from './genres';
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

describe('listGenres', () => {
  it('gets the whole list, with no query string, body or token', async () => {
    const fetchMock = mockFetch({ items: [] });

    await listGenres();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/genres');
    expect(init).toMatchObject({ method: 'GET' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('returns the items wrapper as sent, with no paging fields', async () => {
    const page = { items: [{ id: 1, name: 'Gothic' }] };
    mockFetch(page);

    await expect(listGenres()).resolves.toEqual(page);
  });

  it('asks for the genres with a published book on nonEmpty', async () => {
    const fetchMock = mockFetch({ items: [] });

    await listGenres({ nonEmpty: true });

    expect(callOf(fetchMock)[0]).toBe('/api/genres?nonEmpty=true');
  });
});

describe('createGenre', () => {
  it('posts the name as JSON with the XSRF token', async () => {
    const fetchMock = mockFetch({ id: 5, name: 'Romance' }, 201);

    await expect(createGenre({ name: 'Romance' })).resolves.toEqual({
      id: 5,
      name: 'Romance',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/genres');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Romance' });
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 409 of a name already taken', async () => {
    mockFetch({ error: 'A genre with that name already exists' }, 409);

    await expect(createGenre({ name: 'gothic' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'A genre with that name already exists',
    });
  });
});

describe('renameGenre', () => {
  it('patches the one genre named by the id', async () => {
    const fetchMock = mockFetch({ id: 1, name: 'Gothic Revival' });

    await expect(renameGenre(1, { name: 'Gothic Revival' })).resolves.toEqual({
      id: 1,
      name: 'Gothic Revival',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/genres/1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"name":"Gothic Revival"}');
    expect(init.headers).toEqual(jsonWrite);
  });

  it('rejects with the 404 of a genre that is gone', async () => {
    mockFetch({ error: 'Genre 9 not found' }, 404);

    await expect(renameGenre(9, { name: 'Horror' })).rejects.toMatchObject({
      status: 404,
      message: 'Genre 9 not found',
    });
  });
});

describe('deleteGenre', () => {
  it('deletes by id with the token and no body, resolving on the 204', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(deleteGenre(1)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/genres/1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });

  it('rejects with the 403 a role without the grant gets', async () => {
    mockFetch({ error: 'You may not delete genres' }, 403);

    await expect(deleteGenre(1)).rejects.toMatchObject({
      status: 403,
      message: 'You may not delete genres',
    });
  });
});
