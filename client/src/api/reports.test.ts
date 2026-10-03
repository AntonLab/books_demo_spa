import {
  dismissReport,
  getReportStatistics,
  listReports,
  reportComment,
  takeReport,
  upholdReport,
} from './reports';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';
import { emptyStatistics } from '../test/reports';

const stubFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const callOf = (fetchMock: jest.Mock, index = 0): [string, RequestInit] =>
  fetchMock.mock.calls[index] as [string, RequestInit];

beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('reports api', () => {
  it('lists reports with params in a fixed order and leaves out undefined ones', async () => {
    const fetchMock = stubFetch(
      jsonResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    await listReports({
      from: '2026-10-03T00:00:00.000Z',
      to: '2026-10-04T00:00:00.000Z',
    });
    expect(callOf(fetchMock, 0)[0]).toBe(
      '/api/reports?from=2026-10-03T00%3A00%3A00.000Z&to=2026-10-04T00%3A00%3A00.000Z'
    );

    // Keys given out of order: the URL still follows the fixed order.
    await listReports({
      offset: 100,
      limit: 50,
      status: 'in_review',
      to: 'b',
      from: 'a',
    });
    expect(callOf(fetchMock, 1)[0]).toBe(
      '/api/reports?from=a&to=b&status=in_review&limit=50&offset=100'
    );
  });

  it('gets statistics for a range, with no XSRF token on a GET', async () => {
    const fetchMock = stubFetch(jsonResponse(emptyStatistics()));

    await getReportStatistics({ from: 'a', to: 'b' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/reports/statistics?from=a&to=b');
    expect(init.headers).not.toHaveProperty('X-XSRF-Token');
  });

  it('posts a report with the body and the XSRF token', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 9 }, 201));

    await expect(
      reportComment(5, { reason: 'other', explanation: 'Rude' })
    ).resolves.toEqual({ id: 9 });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/comments/5/report');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      reason: 'other',
      explanation: 'Rude',
    });
    expect(init.headers).toMatchObject({
      'X-XSRF-Token': 'tok-123',
      'Content-Type': 'application/json',
    });
  });

  it.each([
    ['take', takeReport],
    ['uphold', upholdReport],
    ['dismiss', dismissReport],
  ])(
    'posts %s with no body and resolves undefined on 204',
    async (action, fn) => {
      const fetchMock = stubFetch(emptyResponse(204));

      await expect(fn(5)).resolves.toBeUndefined();

      const [url, init] = callOf(fetchMock);
      expect(url).toBe(`/api/reports/5/${action}`);
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(init.headers).toHaveProperty('X-XSRF-Token', 'tok-123');
    }
  );
});
