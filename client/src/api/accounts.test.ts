import { getAccountProfile } from './accounts';
import { jsonResponse } from '../test/httpFixtures';

const mockFetch = (body: unknown, status = 200): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(jsonResponse(body, status));
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

describe('getAccountProfile', () => {
  it('gets /api/accounts/:id with no body and resolves the JSON', async () => {
    const fetchMock = mockFetch({ id: 7, login: 'ann' });

    await expect(getAccountProfile(7)).resolves.toEqual({
      id: 7,
      login: 'ann',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/accounts/7');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('rejects with the 404 of a missing Account', async () => {
    mockFetch({ error: 'Not found' }, 404);

    await expect(getAccountProfile(7)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
  });
});
