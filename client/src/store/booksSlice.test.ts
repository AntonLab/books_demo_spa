import * as booksApi from '../api/books';
import { createAppStore } from './index';
import { fetchBooks } from './booksSlice';
import type { PublicBook } from '../types/book';

jest.mock('../api/books');

const mockedApi = jest.mocked(booksApi);

const book: PublicBook = {
  id: 1,
  userId: 1,
  seriesId: null,
  description: 'A tale of dragons',
  tags: ['epic'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('fetchBooks', () => {
  it('starts idle with an empty list', () => {
    expect(createAppStore().getState().books).toMatchObject({
      items: [],
      total: 0,
      status: 'idle',
      error: null,
    });
  });

  it('is loading while in flight', () => {
    mockedApi.listBooks.mockReturnValue(new Promise(() => {}));
    const store = createAppStore();

    void store.dispatch(fetchBooks());

    expect(store.getState().books.status).toBe('loading');
  });

  it('stores the whole envelope on success', async () => {
    mockedApi.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const store = createAppStore();

    await store.dispatch(fetchBooks());

    expect(store.getState().books).toMatchObject({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
      status: 'ready',
      error: null,
    });
  });

  it('requests the first page of 20', async () => {
    mockedApi.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    const store = createAppStore();

    await store.dispatch(fetchBooks());

    expect(mockedApi.listBooks).toHaveBeenCalledWith({ limit: 20 });
  });

  it('records an error and keeps the list empty on failure', async () => {
    mockedApi.listBooks.mockRejectedValue(new Error('Network down'));
    const store = createAppStore();

    await store.dispatch(fetchBooks());

    expect(store.getState().books).toMatchObject({
      items: [],
      status: 'error',
      error: 'Network down',
    });
  });
});
