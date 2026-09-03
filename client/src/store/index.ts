import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { authReducer } from './authSlice';
import { booksReducer } from './booksSlice';
import { searchReducer } from './searchSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  books: booksReducer,
  search: searchReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// A factory as well as a singleton: every test needs a fresh store, and
// preloadedState is how a component test starts from a given auth state.
export function createAppStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
