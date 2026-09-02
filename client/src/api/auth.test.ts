import {
  confirmReset,
  login,
  logout,
  me,
  register,
  requestReset,
} from './auth';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

function mockFetch(status = 200, body: unknown = {}): jest.Mock {
  const response =
    status === 204 || status === 202
      ? emptyResponse(status)
      : jsonResponse(body, status);
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
}

function callOf(fetchMock: jest.Mock): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe('auth api', () => {
  it('posts a registration to /api/auth/register', async () => {
    const fetchMock = mockFetch(201, { id: 1, login: 'bob' });

    await register({
      login: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      firstName: 'Bob',
      lastName: 'Bobson',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      login: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      firstName: 'Bob',
      lastName: 'Bobson',
    });
  });

  it('posts credentials to /api/auth/login', async () => {
    const fetchMock = mockFetch(200, { id: 1, login: 'bob' });

    await login({ login: 'bob', password: 'secret123' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(String(init.body))).toEqual({
      login: 'bob',
      password: 'secret123',
    });
  });

  it('posts to /api/auth/logout and tolerates the empty 204', async () => {
    const fetchMock = mockFetch(204);

    await expect(logout()).resolves.toBeUndefined();
    expect(callOf(fetchMock)[0]).toBe('/api/auth/logout');
  });

  it('gets /api/auth/me', async () => {
    const fetchMock = mockFetch(200, { id: 1, login: 'bob' });

    await expect(me()).resolves.toMatchObject({ login: 'bob' });
    expect(callOf(fetchMock)[1].method).toBe('GET');
  });

  it('posts only the email to the reset request endpoint', async () => {
    const fetchMock = mockFetch(202);

    await expect(requestReset('bob@example.com')).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/auth/password-reset/request');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'bob@example.com' });
  });

  it('posts the token and new password to the confirm endpoint', async () => {
    const fetchMock = mockFetch(204);

    await expect(
      confirmReset('tok-123', 'newsecret1')
    ).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/auth/password-reset/confirm');
    expect(JSON.parse(String(init.body))).toEqual({
      token: 'tok-123',
      password: 'newsecret1',
    });
  });
});
