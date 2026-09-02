import * as booksApi from '../api/books';
import { createAppStore } from './index';
import { searchBooks } from './searchSlice';
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

describe('searchBooks', () => {
  it('starts idle with an empty term', () => {
    expect(createAppStore().getState().search).toMatchObject({
      q: '',
      items: [],
      total: 0,
      status: 'idle',
      error: null,
    });
  });

  it('records the term as soon as the request starts', () => {
    mockedApi.listBooks.mockReturnValue(new Promise(() => {}));
    const store = createAppStore();

    void store.dispatch(searchBooks('dragon'));

    expect(store.getState().search).toMatchObject({
      q: 'dragon',
      status: 'loading',
    });
  });

  it('passes the term and a page size of 20 to the API', async () => {
    mockedApi.listBooks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    const store = createAppStore();

    await store.dispatch(searchBooks('dragon'));

    expect(mockedApi.listBooks).toHaveBeenCalledWith({
      q: 'dragon',
      limit: 20,
    });
  });

  it('stores results and the total on success', async () => {
    mockedApi.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const store = createAppStore();

    await store.dispatch(searchBooks('dragon'));

    expect(store.getState().search).toMatchObject({
      q: 'dragon',
      items: [book],
      total: 1,
      status: 'ready',
    });
  });

  it('records an error on failure', async () => {
    mockedApi.listBooks.mockRejectedValue(new Error('Network down'));
    const store = createAppStore();

    await store.dispatch(searchBooks('dragon'));

    expect(store.getState().search).toMatchObject({
      status: 'error',
      error: 'Network down',
    });
  });

  it('does not disturb the main book list', async () => {
    mockedApi.listBooks.mockResolvedValue({
      items: [book],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const store = createAppStore();

    await store.dispatch(searchBooks('dragon'));

    expect(store.getState().books.items).toEqual([]);
  });
});
