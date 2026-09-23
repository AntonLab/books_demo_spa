import { createListenerMiddleware } from '@reduxjs/toolkit';
import { THEMES } from './devicePreferencesSlice';
import type { DevicePreferencesState } from './devicePreferencesSlice';
import { isBlank } from './unsavedTextSlice';
import type { UnsavedTextState } from './unsavedTextSlice';
import type { RootState } from './index';

// The `v1` suffix: a later change of shape bumps it, so old data is dropped
// instead of misread.
export const STORAGE_KEYS = {
  devicePreferences: 'books.devicePreferences.v1',
  unsavedText: 'books.unsavedText.v1',
} as const;

// A long Chapter would otherwise be serialised on every keystroke.
export const UNSAVED_TEXT_WRITE_INTERVAL_MS = 500;

// Storage can be missing (a locked-down browser), full, or hold JSON that no
// longer parses. Every access is guarded so the store carries on in memory
// and the page never breaks.
const read = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Over quota or unavailable: the state still lives in memory.
  }
};

const isDevicePreferences = (value: unknown): value is DevicePreferencesState =>
  typeof value === 'object' &&
  value !== null &&
  'theme' in value &&
  (THEMES as readonly unknown[]).includes(value.theme);

const isUnsavedText = (value: unknown): value is UnsavedTextState =>
  typeof value === 'object' &&
  value !== null &&
  'accountId' in value &&
  (value.accountId === null || typeof value.accountId === 'number') &&
  'entries' in value &&
  typeof value.entries === 'object' &&
  value.entries !== null;

export const loadPersistedState = (): Partial<RootState> => {
  const state: Partial<RootState> = {};
  const devicePreferences = read(STORAGE_KEYS.devicePreferences);
  if (isDevicePreferences(devicePreferences)) {
    state.devicePreferences = devicePreferences;
  }
  const unsavedText = read(STORAGE_KEYS.unsavedText);
  if (isUnsavedText(unsavedText)) state.unsavedText = unsavedText;
  return state;
};

// A whitespace-only entry lives in memory while its field is being typed in,
// but is not worth a reload.
const writeUnsavedText = ({ accountId, entries }: UnsavedTextState): void => {
  write(STORAGE_KEYS.unsavedText, {
    accountId,
    entries: Object.fromEntries(
      Object.entries(entries).filter(([, entry]) => !isBlank(entry))
    ),
  });
};

export const persistNow = (state: RootState): void => {
  write(STORAGE_KEYS.devicePreferences, state.devicePreferences);
  writeUnsavedText(state.unsavedText);
};

// One middleware per store, so a test's store never writes through another's
// listener.
export const createPersistenceMiddleware = () => {
  const listener = createListenerMiddleware<RootState>();

  listener.startListening({
    predicate: (_action, current, previous) =>
      current.devicePreferences !== previous.devicePreferences,
    effect: (_action, api) => {
      write(STORAGE_KEYS.devicePreferences, api.getState().devicePreferences);
    },
  });

  // A throttle: the first change stops listening, waits out the interval,
  // writes whatever the state is by then and listens again. Changes inside
  // the window are carried by that one write.
  listener.startListening({
    predicate: (_action, current, previous) =>
      current.unsavedText !== previous.unsavedText,
    effect: async (_action, api) => {
      api.unsubscribe();
      await api.delay(UNSAVED_TEXT_WRITE_INTERVAL_MS);
      writeUnsavedText(api.getState().unsavedText);
      api.subscribe();
    },
  });

  return listener.middleware;
};
