import { createSlice } from '@reduxjs/toolkit';

const booksSlice = createSlice({
  name: 'books',
  initialState: {},
  reducers: {},
});

export const booksReducer = booksSlice.reducer;
