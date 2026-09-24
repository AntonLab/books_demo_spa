import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// Device preferences (CONTEXT.md): how the app looks on this device. Not tied
// to an Account, so signing out keeps them. Reading font size and the like
// arrive with the reader as more fields here.
export const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

export const RESULTS_LAYOUTS = ['grid', 'list'] as const;
export type ResultsLayout = (typeof RESULTS_LAYOUTS)[number];

export interface DevicePreferencesState {
  theme: Theme;
  resultsLayout: ResultsLayout;
  // Whether the search page's form is open. Open by default.
  searchFormExpanded: boolean;
}

export const initialDevicePreferences: DevicePreferencesState = {
  theme: 'light',
  resultsLayout: 'grid',
  searchFormExpanded: true,
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
