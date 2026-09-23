import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { devicePreferencesReducer } from './devicePreferencesSlice';
import { createPersistenceMiddleware, loadPersistedState } from './persistence';

// Client state only (ADR-0010): what outlives the component showing it and
// never reaches the server. Everything fetched lives in src/queries/.
const rootReducer = combineReducers({
  devicePreferences: devicePreferencesReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// A factory as well as the singleton: every test builds a fresh store from its
// own preloadedState. Omitted, the state is read from localStorage once.
export const createAppStore = (
  preloadedState: Partial<RootState> = loadPersistedState()
) => {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(createPersistenceMiddleware()),
  });
};

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
