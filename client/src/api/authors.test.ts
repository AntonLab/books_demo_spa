import { searchAuthors } from './authors';
import { jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock): [string, RequestInit] => {
  return fetchMock.mock.calls[0] as [string, RequestInit];
};

const ann = { id: 3, login: 'ann', firstName: 'Ann', lastName: 'Author' };

describe('searchAuthors', () => {
  // A session's token is set so a read that wrongly carried it would show.
  beforeEach(() => {
    document.cookie = 'xsrfToken=tok-123';
  });
  afterEach(() => {
    document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('gets /api/authors with the term as q, and no body or token', async () => {
    const fetchMock = mockFetch(jsonResponse({ items: [] }));

    await searchAuthors('ann');

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/authors?q=ann');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('form-encodes the term, so spaces and & cannot split the query', async () => {
    const fetchMock = mockFetch(jsonResponse({ items: [] }));

    await searchAuthors('Ann Lee&limit=50');

    expect(callOf(fetchMock)[0]).toBe('/api/authors?q=Ann+Lee%26limit%3D50');
  });

  it('sends no q for a blank term, which the server would reject', async () => {
    const fetchMock = mockFetch(jsonResponse({ items: [] }));

    await searchAuthors('');

    expect(callOf(fetchMock)[0]).toBe('/api/authors');
  });

  it('unwraps the items, returning the authors alone', async () => {
    mockFetch(jsonResponse({ items: [ann] }));

    await expect(searchAuthors('ann')).resolves.toEqual([ann]);
  });

  it('rejects with the 401 a signed-out caller gets', async () => {
    mockFetch(jsonResponse({ error: 'Authentication required' }, 401));

    await expect(searchAuthors('ann')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Authentication required',
    });
  });
});
