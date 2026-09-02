import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { listBooks } from '../api/books';
import { BOOKS_PAGE_SIZE } from './booksSlice';
import type { LoadStatus } from './booksSlice';
import type { ListResponse } from '../types/api';
import type { PublicBook } from '../types/book';

export interface SearchState {
  q: string;
  items: PublicBook[];
  total: number;
  status: LoadStatus;
  error: string | null;
}

const initialState: SearchState = {
  q: '',
  items: [],
  total: 0,
  status: 'idle',
  error: null,
};

// Deliberately separate from booksSlice: sharing one `items` array would let a
// search overwrite the MainPage list and leave stale results behind when the
// user navigates home.
export const searchBooks = createAsyncThunk<ListResponse<PublicBook>, string>(
  'search/searchBooks',
  (q) => listBooks({ q, limit: BOOKS_PAGE_SIZE })
);

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(searchBooks.pending, (state, action) => {
        // `meta.arg` is the term this request was started with, so the state
        // always names the query its results belong to.
        state.q = action.meta.arg;
        state.status = 'loading';
        state.error = null;
      })
      .addCase(searchBooks.fulfilled, (state, action) => {
        state.q = action.meta.arg;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.status = 'ready';
        state.error = null;
      })
      .addCase(searchBooks.rejected, (state, action) => {
        state.q = action.meta.arg;
        state.status = 'error';
        state.error = action.error.message ?? 'Could not run the search';
      });
  },
});

export const searchReducer = searchSlice.reducer;
