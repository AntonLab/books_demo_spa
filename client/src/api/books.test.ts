import {
  addCoAuthor,
  createBook,
  deleteBook,
  deleteBookCover,
  getBook,
  listBooks,
  removeCoAuthor,
  updateBook,
  uploadBookCover,
} from './books';
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

  it('names the caller with userId, the one list that includes drafts', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ userId: 3, limit: 100 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books?userId=3&limit=100');
  });

  it('narrows the list to one series with seriesId', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ seriesId: 12, limit: 20 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books?seriesId=12&limit=20');
  });

  it('narrows the list to one genre with genreId', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ genreId: 4, limit: 20 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books?genreId=4&limit=20');
  });

  it('ranks the list with sort', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ sort: 'popular', limit: 6 });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/books?sort=popular&limit=6');
  });

  it('combines genreId with the other filters, in a fixed order', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks({ q: 'dragon', seriesId: 12, genreId: 4, limit: 20 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/books?q=dragon&seriesId=12&genreId=4&limit=20'
    );
  });

  it('is a plain read: no body and no headers, the XSRF token included', async () => {
    const fetchMock = mockFetch(envelope);

    await listBooks();

    const [, init] = callOf(fetchMock);
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
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

describe('getBook', () => {
  it('gets one book by id, with no body or token', async () => {
    const fetchMock = mockFetch({ id: 7 });

    await getBook(7);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('returns the detail as the server sent it', async () => {
    const detail = { id: 7, series: { id: 2, title: 'Saga' }, likeCount: 4 };
    mockFetch(detail);

    await expect(getBook(7)).resolves.toEqual(detail);
  });

  it('rejects with the 404 of a book the viewer may not see', async () => {
    mockFetch({ error: 'Book 7 not found' }, 404);

    await expect(getBook(7)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Book 7 not found',
    });
  });
});

describe('createBook', () => {
  it('posts the fields as JSON with the XSRF token', async () => {
    const fetchMock = mockFetch({ id: 9 }, 201);

    await createBook({
      title: 'New',
      description: 'Fresh.',
      tags: ['epic'],
      seriesId: null,
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'New',
      description: 'Fresh.',
      tags: ['epic'],
      seriesId: null,
    });
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
  });

  it('returns the created book from the 201', async () => {
    mockFetch({ id: 9, title: 'New', status: 'draft' }, 201);

    await expect(
      createBook({ title: 'New', description: '', tags: [], seriesId: null })
    ).resolves.toEqual({ id: 9, title: 'New', status: 'draft' });
  });

  it('sends an explicit null genreId when no genre is chosen', async () => {
    const fetchMock = mockFetch({ id: 7 }, 201);

    await createBook({
      title: 'New',
      description: '',
      tags: [],
      seriesId: null,
      genreId: null,
    });

    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({
      title: 'New',
      description: '',
      tags: [],
      seriesId: null,
      genreId: null,
    });
  });
});

describe('updateBook', () => {
  it('patches only the fields it is given', async () => {
    const fetchMock = mockFetch({ id: 7 });

    await updateBook(7, { status: 'complete' });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7');
    expect(init.method).toBe('PATCH');
    // Exactly the one key: the server's PATCH treats every present key as an
    // edit, so a stray `seriesId: undefined` must not become `null`.
    expect(init.body).toBe('{"status":"complete"}');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
  });

  it('sends an explicit null seriesId, which unlinks the book', async () => {
    const fetchMock = mockFetch({ id: 7 });

    await updateBook(7, { seriesId: null });

    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({
      seriesId: null,
    });
  });

  it('rejects with the 403 the server gives a non-co-author', async () => {
    mockFetch({ error: 'You may only change books you co-author' }, 403);

    await expect(updateBook(7, { title: 'x' })).rejects.toMatchObject({
      status: 403,
      message: 'You may only change books you co-author',
    });
  });

  it('patches the genre alone, leaving every other field untouched', async () => {
    const fetchMock = mockFetch({ id: 7 });

    await updateBook(7, { genreId: 4 });

    expect(callOf(fetchMock)[1].body).toBe('{"genreId":4}');
  });

  // Guards the safety-critical case: a payload that turned an absent key
  // into `null` would silently clear a Genre on a title-only save.
  it('leaves genreId off the wire when patching an unrelated field', async () => {
    const fetchMock = mockFetch({ id: 7 });

    await updateBook(7, { title: 'x' });

    const body = JSON.parse(String(callOf(fetchMock)[1].body));
    expect('genreId' in body).toBe(false);
  });
});

describe('deleteBook', () => {
  it('deletes by id with the token and no body', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await expect(deleteBook(7)).resolves.toBeUndefined();

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });
});

describe('addCoAuthor', () => {
  it('posts the account id to the book co-authors', async () => {
    const fetchMock = mockFetch({ id: 7, authors: [] });

    await addCoAuthor(7, 4);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7/co-authors');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ userId: 4 });
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-XSRF-Token': 'tok-123',
    });
  });

  it('returns the book with its new byline', async () => {
    const credited = { id: 7, authors: [{ id: 3 }, { id: 4 }] };
    mockFetch(credited);

    await expect(addCoAuthor(7, 4)).resolves.toEqual(credited);
  });

  it('rejects with the 409 for an account already credited', async () => {
    mockFetch(
      { error: 'That account is already a co-author of this book' },
      409
    );

    await expect(addCoAuthor(7, 4)).rejects.toMatchObject({
      status: 409,
      message: 'That account is already a co-author of this book',
    });
  });
});

describe('removeCoAuthor', () => {
  it('deletes the credit named by both ids, with no body', async () => {
    const fetchMock = mockFetch({ id: 7, authors: [{ id: 3 }] });

    await expect(removeCoAuthor(7, 4)).resolves.toEqual({
      id: 7,
      authors: [{ id: 3 }],
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/7/co-authors/4');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ 'X-XSRF-Token': 'tok-123' });
  });

  it('rejects with the 409 when the last co-author tries to leave', async () => {
    mockFetch(
      { error: 'The last co-author cannot leave; delete the book instead' },
      409
    );

    await expect(removeCoAuthor(7, 3)).rejects.toMatchObject({
      status: 409,
      message: 'The last co-author cannot leave; delete the book instead',
    });
  });
});

describe('uploadBookCover', () => {
  it('PUTs the file as-is to /books/:id/cover', async () => {
    const fetchMock = mockFetch({ id: 1, coverUrl: '/api/books/1/cover?v=2' });
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.webp', {
      type: 'image/webp',
    });

    await uploadBookCover(1, file);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/1/cover');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'image/webp'
    );
  });
});

describe('deleteBookCover', () => {
  it('DELETEs /books/:id/cover with no body', async () => {
    const fetchMock = mockFetch(undefined, 204);

    await deleteBookCover(1);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/books/1/cover');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});
