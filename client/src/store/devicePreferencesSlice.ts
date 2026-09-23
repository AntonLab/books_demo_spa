import { createSlice } from '@reduxjs/toolkit';

// Device preferences (CONTEXT.md): how the app looks on this device. Not tied
// to an Account, so signing out keeps them. Reading font size and the like
// arrive with the reader as more fields here.
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface DevicePreferencesState {
  theme: Theme;
}

const initialState: DevicePreferencesState = { theme: 'light' };

const slice = createSlice({
  name: 'devicePreferences',
  initialState,
  reducers: {
    themeToggled(state) {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
  },
});

export const devicePreferences = slice.actions;
export const devicePreferencesReducer = slice.reducer;
