import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  devicePreferences,
  devicePreferencesReducer,
} from './devicePreferencesSlice';
import { unsavedText, unsavedTextReducer } from './unsavedTextSlice';
import {
  createPersistenceMiddleware,
  loadPersistedState,
  parsePersisted,
  persistNow,
  STORAGE_KEYS,
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

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];

// Two open tabs each hold their own copy of both slices; without this, one
// tab's next write silently overwrites what the other just typed or logged
// out. Exported so a test can call it against a store of its own instead of
// dispatching a real `storage` event at the singleton below.
export const syncFromStorageEvent = (
  target: AppStore,
  event: Pick<StorageEvent, 'key' | 'newValue'>
): void => {
  if (
    event.key !== STORAGE_KEYS.devicePreferences &&
    event.key !== STORAGE_KEYS.unsavedText
  ) {
    return;
  }
  const parsed = parsePersisted(event.key, event.newValue);
  // undefined: corrupt or unrecognised, keep this tab's state as is.
  if (parsed === undefined) return;
  if (event.key === STORAGE_KEYS.devicePreferences) {
    target.dispatch(
      devicePreferences.replaced(parsed?.devicePreferences ?? null)
    );
  } else {
    target.dispatch(unsavedText.replaced(parsed?.unsavedText ?? null));
  }
};

export const store = createAppStore();

// The Unsaved text write is throttled; a reload inside the window would lose
// the last keystrokes without this flush.
window.addEventListener('pagehide', () => persistNow(store.getState()));
// `storage` fires only in a tab other than the one that wrote the key, so
// this never reacts to the write the throttled listener above just made.
window.addEventListener('storage', (event) =>
  syncFromStorageEvent(store, event)
);
