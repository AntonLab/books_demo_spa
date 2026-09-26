import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// Device preferences (CONTEXT.md): how the app looks on this device. Not tied
// to an Account, so signing out keeps them.
export const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

export const RESULTS_LAYOUTS = ['grid', 'list'] as const;
export type ResultsLayout = (typeof RESULTS_LAYOUTS)[number];

// How a Chapter reads. `auto` follows the app's theme; every other background
// keeps its own colours whatever the theme.
export const READING_BACKGROUNDS = [
  'auto',
  'white',
  'sepia',
  'dark',
  'black',
] as const;
export type ReadingBackground = (typeof READING_BACKGROUNDS)[number];

export const READING_FONTS = ['sans', 'serif'] as const;
export type ReadingFont = (typeof READING_FONTS)[number];

export const READING_LINE_HEIGHTS = [1.4, 1.6, 1.8, 2] as const;
export type ReadingLineHeight = (typeof READING_LINE_HEIGHTS)[number];

export const READING_WIDTHS = ['narrow', 'medium', 'wide', 'full'] as const;
export type ReadingWidth = (typeof READING_WIDTHS)[number];

// Scroll is one continuous column; Pages lays the text out in screen-sized
// pages turned sideways (CONTEXT.md, Reading layout).
export const READING_LAYOUTS = ['scroll', 'pages'] as const;
export type ReadingLayout = (typeof READING_LAYOUTS)[number];

export const READING_FONT_SIZE = { min: 14, max: 28, step: 2 } as const;

export interface ReadingPreferences {
  background: ReadingBackground;
  font: ReadingFont;
  fontSize: number;
  lineHeight: ReadingLineHeight;
  width: ReadingWidth;
  layout: ReadingLayout;
}

export const initialReadingPreferences: ReadingPreferences = {
  background: 'auto',
  font: 'sans',
  fontSize: 16,
  lineHeight: 1.6,
  width: 'medium',
  layout: 'scroll',
};

export interface DevicePreferencesState {
  theme: Theme;
  resultsLayout: ResultsLayout;
  // Whether the search page's form is open. Open by default.
  searchFormExpanded: boolean;
  reading: ReadingPreferences;
}

export const initialDevicePreferences: DevicePreferencesState = {
  theme: 'light',
  resultsLayout: 'grid',
  searchFormExpanded: true,
  reading: initialReadingPreferences,
};

const slice = createSlice({
  name: 'devicePreferences',
  initialState: initialDevicePreferences,
  reducers: {
    themeToggled(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
    resultsLayoutChanged(state, action: PayloadAction<ResultsLayout>) {
      state.resultsLayout = action.payload;
    },
    searchFormExpandedChanged(state, action: PayloadAction<boolean>) {
      state.searchFormExpanded = action.payload;
    },
    readingChanged(state, action: PayloadAction<Partial<ReadingPreferences>>) {
      Object.assign(state.reading, action.payload);
    },
    readingReset(state) {
      state.reading = initialReadingPreferences;
    },
    // Another tab's write, relayed by the `storage` event: that tab's value
    // wins here too. `null` means that tab cleared the key (a corrupt value
    // is filtered out before this dispatches, so it never arrives here).
    replaced(_state, action: PayloadAction<DevicePreferencesState | null>) {
      return action.payload ?? initialDevicePreferences;
    },
  },
});

export const devicePreferences = slice.actions;
export const devicePreferencesReducer = slice.reducer;
