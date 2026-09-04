import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { authReducer } from './authSlice';

// One slice, and it holds no server state: which auth modal is open and the
// reset token the URL carried into it. Everything fetched lives in the
// TanStack Query cache — see src/queries/.
const rootReducer = combineReducers({
  auth: authReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// A factory as well as a singleton: every test needs a fresh store, and
// preloadedState is how a component test starts from a given auth state.
export const createAppStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({ reducer: rootReducer, preloadedState });
};

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
