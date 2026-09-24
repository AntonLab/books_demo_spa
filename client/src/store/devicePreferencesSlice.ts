import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

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
    // Another tab's write, relayed by the `storage` event: that tab's value
    // wins here too. `null` means that tab cleared the key (a corrupt value
    // is filtered out before this dispatches, so it never arrives here).
    replaced(_state, action: PayloadAction<DevicePreferencesState | null>) {
      return action.payload ?? initialState;
    },
  },
});

export const devicePreferences = slice.actions;
export const devicePreferencesReducer = slice.reducer;
