import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { BOOK_IDS_MAX } from 'shared';

// Recently viewed (CONTEXT.md): Book ids, newest first. `accountId` is the
// Account the history last belonged to, `null` while it is only a Guest's.
export interface RecentlyViewedState {
  accountId: number | null;
  ids: number[];
}

const initialState: RecentlyViewedState = { accountId: null, ids: [] };

const slice = createSlice({
  name: 'recentlyViewed',
  initialState,
  reducers: {
    record(state, action: PayloadAction<number>) {
      state.ids = [
        action.payload,
        ...state.ids.filter((id) => id !== action.payload),
      ].slice(0, BOOK_IDS_MAX);
    },
    // Another tab's write, relayed by the `storage` event: that tab's value
    // wins here too. `null` means that tab cleared the key (a corrupt value
    // is filtered out before this dispatches, so it never arrives here).
    replaced(_state, action: PayloadAction<RecentlyViewedState | null>) {
      return action.payload ?? initialState;
    },
    // History follows the Account, not the session: a Guest's history goes to
    // the Account that signs in, another Account's is cleared.
    accountChanged(state, action: PayloadAction<number>) {
      if (state.accountId !== null && state.accountId !== action.payload) {
        state.ids = [];
      }
      state.accountId = action.payload;
    },
  },
});

export const recentlyViewed = slice.actions;
export const recentlyViewedReducer = slice.reducer;
