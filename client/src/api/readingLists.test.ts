import {
  addReadingListItem,
  copyReadingList,
  createReadingList,
  deleteReadingList,
  getReadingList,
  listMyReadingLists,
  listReadingListItems,
  listReadingLists,
  removeReadingListItem,
  reorderReadingListItems,
  updateReadingList,
} from './readingLists';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};
const callOf = (fetchMock: jest.Mock): [string, RequestInit] =>
  fetchMock.mock.calls[0] as [string, RequestInit];

beforeEach(() => {
  document.cookie = 'xsrfToken=tok-123';
});
afterEach(() => {
  document.cookie = 'xsrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('reads', () => {
  it.each([
    ['getReadingList', () => getReadingList(4), '/api/reading-lists/4'],
    [
      'listReadingListItems',
      () => listReadingListItems(4),
      '/api/reading-lists/4/items',
    ],
    [
      'listMyReadingLists for a Book',
      () => listMyReadingLists({ bookId: 7 }),
      '/api/reading-lists/mine?bookId=7',
    ],
    [
      'listMyReadingLists for a Series',
      () => listMyReadingLists({ seriesId: 3 }),
      '/api/reading-lists/mine?seriesId=3',
    ],
    [
      'listReadingLists, only what was given',
      () => listReadingLists({ userId: 9, current: 2 }),
      '/api/reading-lists?userId=9&current=2',
    ],
  ])('%s asks %s without the XSRF token', async (_name, call, url) => {
    const fetchMock = mockFetch(jsonResponse({ items: [] }));
    await call();
    const [calledUrl, init] = callOf(fetchMock);
    expect(calledUrl).toBe(url);
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers).not.toHaveProperty('X-XSRF-Token');
  });
});

describe('writes', () => {
  it.each([
    [
      'createReadingList',
      () => createReadingList({ title: 'T', description: '', tags: [] }),
      'POST',
      '/api/reading-lists',
      '{"title":"T","description":"","tags":[]}',
    ],
    [
      'updateReadingList',
      () => updateReadingList(4, { title: 'U' }),
      'PATCH',
      '/api/reading-lists/4',
      '{"title":"U"}',
    ],
    [
      'addReadingListItem a Book',
      () => addReadingListItem(4, { bookId: 7 }),
      'POST',
      '/api/reading-lists/4/items',
      '{"bookId":7}',
    ],
    [
      'addReadingListItem a Series',
      () => addReadingListItem(4, { seriesId: 3 }),
      'POST',
      '/api/reading-lists/4/items',
      '{"seriesId":3}',
    ],
    [
      'copyReadingList',
      () => copyReadingList(4),
      'POST',
      '/api/reading-lists/4/copy',
      undefined,
    ],
  ])(
    '%s sends %s %s with the XSRF token',
    async (_name, call, method, url, body) => {
      const fetchMock = mockFetch(jsonResponse({ id: 1 }));
      await call();
      const [calledUrl, init] = callOf(fetchMock);
      expect([calledUrl, init.method, init.body]).toEqual([url, method, body]);
      expect(init.headers).toMatchObject({ 'X-XSRF-Token': 'tok-123' });
    }
  );

  it('puts the full id order to /item-order and resolves to undefined', async () => {
    const fetchMock = mockFetch(emptyResponse(204));
    await expect(
      reorderReadingListItems(4, [3, 1, 2])
    ).resolves.toBeUndefined();
    const [url, init] = callOf(fetchMock);
    expect([url, init.method, init.body]).toEqual([
      '/api/reading-lists/4/item-order',
      'PUT',
      '{"itemIds":[3,1,2]}',
    ]);
  });

  it.each([
    ['deleteReadingList', () => deleteReadingList(4), '/api/reading-lists/4'],
    [
      'removeReadingListItem',
      () => removeReadingListItem(4, 9),
      '/api/reading-lists/4/items/9',
    ],
  ])('%s deletes %s and resolves to undefined', async (_name, call, url) => {
    const fetchMock = mockFetch(emptyResponse(204));
    await expect(call()).resolves.toBeUndefined();
    expect([callOf(fetchMock)[0], callOf(fetchMock)[1].method]).toEqual([
      url,
      'DELETE',
    ]);
  });
});
