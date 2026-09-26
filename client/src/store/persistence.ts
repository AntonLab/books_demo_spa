import { createListenerMiddleware } from '@reduxjs/toolkit';
import {
  initialDevicePreferences,
  initialReadingPreferences,
  READING_BACKGROUNDS,
  READING_FONT_SIZE,
  READING_FONTS,
  READING_LAYOUTS,
  READING_LINE_HEIGHTS,
  READING_WIDTHS,
  RESULTS_LAYOUTS,
  THEMES,
} from './devicePreferencesSlice';
import type {
  DevicePreferencesState,
  ReadingPreferences,
} from './devicePreferencesSlice';
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
const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Over quota or unavailable: the state still lives in memory.
  }
};

const isReadingFontSize = (value: unknown): value is number =>
  typeof value === 'number' &&
  value >= READING_FONT_SIZE.min &&
  value <= READING_FONT_SIZE.max &&
  (value - READING_FONT_SIZE.min) % READING_FONT_SIZE.step === 0;

const oneOf = <T>(options: readonly T[], value: unknown, fallback: T): T =>
  options.find((known) => known === value) ?? fallback;

// Field by field, like the rest: one unknown value falls back alone.
const toReadingPreferences = (value: unknown): ReadingPreferences => {
  const stored = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Record<string, unknown>;
  const initial = initialReadingPreferences;
  return {
    background: oneOf(
      READING_BACKGROUNDS,
      stored.background,
      initial.background
    ),
    font: oneOf(READING_FONTS, stored.font, initial.font),
    fontSize: isReadingFontSize(stored.fontSize)
      ? stored.fontSize
      : initial.fontSize,
    lineHeight: oneOf(
      READING_LINE_HEIGHTS,
      stored.lineHeight,
      initial.lineHeight
    ),
    width: oneOf(READING_WIDTHS, stored.width, initial.width),
    layout: oneOf(READING_LAYOUTS, stored.layout, initial.layout),
  };
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
    resultsLayout: oneOf(
      RESULTS_LAYOUTS,
      stored.resultsLayout,
      initialDevicePreferences.resultsLayout
    ),
    searchFormExpanded:
      typeof stored.searchFormExpanded === 'boolean'
        ? stored.searchFormExpanded
        : initialDevicePreferences.searchFormExpanded,
    reading: toReadingPreferences(stored.reading),
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

// Parses a raw storage value through the guards above: this tab's own at load,
// and another tab's for the `storage` event listener in index.ts. `null` (the
// key was cleared) and a value of the wrong shape are told apart: `null`
// return means "reset the slice", `undefined` means "ignore, keep this tab's
// state".
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

// null and undefined both leave the slice to its initial state here.
export const loadPersistedState = (): Partial<RootState> =>
  Object.assign(
    {},
    ...Object.values(STORAGE_KEYS).map((key) =>
      parsePersisted(key, readRaw(key))
    )
  ) as Partial<RootState>;

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
