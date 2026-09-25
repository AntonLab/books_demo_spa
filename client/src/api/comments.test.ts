import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from './comments';
import { emptyResponse, jsonResponse } from '../test/httpFixtures';

const mockFetch = (response: Response): jest.Mock => {
  const fn = jest.fn().mockResolvedValue(response);
  window.fetch = fn as unknown as typeof fetch;
  return fn;
};

const envelope = { items: [], total: 0, limit: 100, offset: 0 };

describe('listComments', () => {
  it('requests the comments for one book at the page size', async () => {
    const fetchMock = mockFetch(jsonResponse(envelope));

    await listComments(7);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/comments?bookId=7&limit=100');
  });

  it('sends the session cookie', async () => {
    const fetchMock = mockFetch(jsonResponse(envelope));

    await listComments(7);

    // Without credentials the browser withholds the httpOnly `sid` cookie, and
    // viewerLikeId would come back null for a signed-in reader.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
    });
  });
});

describe('createComment', () => {
  it('posts the book, parent and text', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }));

    await createComment({ bookId: 7, parentId: null, text: 'hi' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/comments');
    // Asserted as a string because request() stringifies the body before
    // handing it to fetch; the module itself passes the object.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ bookId: 7, parentId: null, text: 'hi' }),
    });
  });

  it('carries a parentId for a reply', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 2 }));

    await createComment({ bookId: 7, parentId: 5, text: 'agreed' });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ bookId: 7, parentId: 5, text: 'agreed' }),
    });
  });

  it('never sends a userId — the server takes it from the session', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 3 }));

    await createComment({ bookId: 7, parentId: null, text: 'hi' });

    const { body } = fetchMock.mock.calls[0][1] as { body: string };
    expect(body).not.toContain('userId');
  });
});

describe('updateComment', () => {
  it('patches only the text', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }));

    await updateComment(5, 'edited');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/comments/5');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ text: 'edited' }),
    });
  });
});

describe('deleteComment', () => {
  it('resolves on the server 204, which carries no body', async () => {
    mockFetch(emptyResponse(204));

    await expect(deleteComment(5)).resolves.toBeUndefined();
  });
});
