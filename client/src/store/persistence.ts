import { createListenerMiddleware } from '@reduxjs/toolkit';
import {
  initialDevicePreferences,
  RESULTS_LAYOUTS,
  THEMES,
} from './devicePreferencesSlice';
import type { DevicePreferencesState } from './devicePreferencesSlice';
import { isBlank, unsavedText } from './unsavedTextSlice';
import type { UnsavedTextEntry, UnsavedTextState } from './unsavedTextSlice';
import type { RootState } from './index';

// The `v1` suffix: a change that would misread old data (a renamed or retyped
// field) bumps it, so that data is dropped instead. An added field with a
// default does not; the reader fills it in.
export const STORAGE_KEYS = {
  devicePreferences: 'books.devicePreferences.v1',
  unsavedText: 'books.unsavedText.v1',
} as const;

// A long Chapter would otherwise be serialised on every keystroke.
const UNSAVED_TEXT_WRITE_INTERVAL_MS = 500;

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

// A field added since the value was stored reads as its default rather than
// failing the whole value, so an addition needs no new key and nobody loses
// the theme they chose. Only a bad `theme` drops the value.
const toDevicePreferences = (
  value: unknown
): DevicePreferencesState | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const stored = value as Record<string, unknown>;
  const theme = THEMES.find((known) => known === stored.theme);
  if (theme === undefined) return undefined;
  return {
    theme,
    resultsLayout:
      RESULTS_LAYOUTS.find((known) => known === stored.resultsLayout) ??
      initialDevicePreferences.resultsLayout,
    searchFormExpanded:
      typeof stored.searchFormExpanded === 'boolean'
        ? stored.searchFormExpanded
        : initialDevicePreferences.searchFormExpanded,
  };
};

// Only the top shape: `accountId` and an `entries` object. Each entry is
// checked separately by `isValidEntry`, since a single malformed entry (from
// a future shape, or storage edited by hand) must not fail the whole slice.
const isUnsavedTextShape = (
  value: unknown
): value is { accountId: number | null; entries: Record<string, unknown> } =>
  typeof value === 'object' &&
  value !== null &&
  'accountId' in value &&
  (value.accountId === null || typeof value.accountId === 'number') &&
  'entries' in value &&
  typeof value.entries === 'object' &&
  value.entries !== null &&
  !Array.isArray(value.entries);

// An entry with a non-string `text` (or `title`/`baseUpdatedAt`) would throw
// inside `isBlank`/`entriesOfBook` once a page reads it, landing the page in
// the ErrorBoundary. Dropping it here is cheaper than guarding every reader.
const isValidEntry = (value: unknown): value is UnsavedTextEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const { text, title, baseUpdatedAt, savedAt } = value as Record<
    string,
    unknown
  >;
  return (
    typeof text === 'string' &&
    (title === undefined || typeof title === 'string') &&
    (baseUpdatedAt === undefined || typeof baseUpdatedAt === 'string') &&
    typeof savedAt === 'string'
  );
};

const validEntries = (
  entries: Record<string, unknown>
): Record<string, UnsavedTextEntry> => {
  const result: Record<string, UnsavedTextEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (isValidEntry(entry)) result[key] = entry;
  }
  return result;
};

export const loadPersistedState = (): Partial<RootState> => {
  const state: Partial<RootState> = {};
  const devicePreferences = toDevicePreferences(
    read(STORAGE_KEYS.devicePreferences)
  );
  if (devicePreferences !== undefined) {
    state.devicePreferences = devicePreferences;
  }
  const unsavedText = read(STORAGE_KEYS.unsavedText);
  if (isUnsavedTextShape(unsavedText)) {
    state.unsavedText = {
      accountId: unsavedText.accountId,
      entries: validEntries(unsavedText.entries),
    };
  }
  return state;
};

// Parses another tab's raw storage value through the same guards above, for
// the `storage` event listener in index.ts. `null` (the key was cleared) and
// a value of the wrong shape are told apart: `null` return means "reset the
// slice", `undefined` means "ignore, keep this tab's state".
export const parsePersisted = (
  key: string,
  raw: string | null
): Partial<RootState> | null | undefined => {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (key === STORAGE_KEYS.devicePreferences) {
    const devicePreferences = toDevicePreferences(value);
    return devicePreferences && { devicePreferences };
  }
  if (key === STORAGE_KEYS.unsavedText && isUnsavedTextShape(value)) {
    return {
      unsavedText: {
        accountId: value.accountId,
        entries: validEntries(value.entries),
      },
    };
  }
  return undefined;
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
  // the window are carried by that one write. `replaced` starts no write: its
  // value came from storage, and writing it back 500 ms later could revert a
  // newer value the other tab wrote in between.
  listener.startListening({
    predicate: (action, current, previous) =>
      !unsavedText.replaced.match(action) &&
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
