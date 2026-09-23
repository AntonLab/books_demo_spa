import { createListenerMiddleware } from '@reduxjs/toolkit';
import { THEMES } from './devicePreferencesSlice';
import type { DevicePreferencesState } from './devicePreferencesSlice';
import type { RootState } from './index';

// The `v1` suffix: a later change of shape bumps it, so old data is dropped
// instead of misread.
export const STORAGE_KEYS = {
  devicePreferences: 'books.devicePreferences.v1',
} as const;

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

export const loadPersistedState = (): Partial<RootState> => {
  const devicePreferences = read(STORAGE_KEYS.devicePreferences);
  return isDevicePreferences(devicePreferences) ? { devicePreferences } : {};
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

  return listener.middleware;
};
