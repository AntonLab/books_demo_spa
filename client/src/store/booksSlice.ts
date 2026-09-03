import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { listBooks } from '../api/books';
import type { ListResponse } from '../types/api';
import type { PublicBook } from '../types/book';

// Shared with searchSlice and BookList so the three cannot drift.
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// The first page only. Paging is a documented non-goal; `total` is kept so the
// count can be displayed and paging added later without a state change.
export const BOOKS_PAGE_SIZE = 20;

export interface BooksState {
  items: PublicBook[];
  total: number;
  limit: number;
  offset: number;
  status: LoadStatus;
  error: string | null;
}

const initialState: BooksState = {
  items: [],
  total: 0,
  limit: BOOKS_PAGE_SIZE,
  offset: 0,
  status: 'idle',
  error: null,
};

export const fetchBooks = createAsyncThunk<ListResponse<PublicBook>>(
  'books/fetchBooks',
  () => listBooks({ limit: BOOKS_PAGE_SIZE })
);

const booksSlice = createSlice({
  name: 'books',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBooks.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBooks.fulfilled, (state, action) => {
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.limit = action.payload.limit;
        state.offset = action.payload.offset;
        state.status = 'ready';
        state.error = null;
      })
      .addCase(fetchBooks.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'Could not load books';
      });
  },
});

export const booksReducer = booksSlice.reducer;
