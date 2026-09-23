import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { devicePreferencesReducer } from './devicePreferencesSlice';
import { unsavedTextReducer } from './unsavedTextSlice';
import {
  createPersistenceMiddleware,
  loadPersistedState,
  persistNow,
} from './persistence';

// Client state only (ADR-0010): what outlives the component showing it and
// never reaches the server. Everything fetched lives in src/queries/.
const rootReducer = combineReducers({
  devicePreferences: devicePreferencesReducer,
  unsavedText: unsavedTextReducer,
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

// The Unsaved text write is throttled; a reload inside the window would lose
// the last keystrokes without this flush.
window.addEventListener('pagehide', () => persistNow(store.getState()));

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
