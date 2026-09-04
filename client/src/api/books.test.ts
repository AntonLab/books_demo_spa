import { listBooks } from './books';
import { jsonResponse } from '../test/httpFixtures';

const mockFetch = (body: unknown): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(jsonResponse(body));
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const envelope = { items: [], total: 0, limit: 20, offset: 0 };

describe('listBooks', () => {
  it('requests /api/books with no query string when given no params', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books');
  });

  it('encodes q, limit and offset into the query string', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ q: 'dragon riders', limit: 20, offset: 40 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/books?q=dragon+riders&limit=20&offset=40'
    );
  });

  it('omits an empty q rather than sending q= which the server rejects', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ q: '', limit: 20 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books?limit=20');
  });

  it('returns the list envelope unchanged', async () => {
    mockFetch({
      items: [{ id: 1, description: 'A book' }],
      total: 1,
      limit: 20,
      offset: 0,
    });

    await expect(listBooks()).resolves.toMatchObject({ total: 1 });
  });
});
