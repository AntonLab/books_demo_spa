import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// `as const` union rather than an enum, per the repository rules.
export const MODAL_NAMES = [
  'login',
  'register',
  'resetRequest',
  'resetConfirm',
] as const;
export type ModalName = (typeof MODAL_NAMES)[number];

// UI state only. The signed-in user lives in the TanStack Query cache under
// `queryKeys.session` — see src/queries/auth.ts. What is left here is the
// state no server can answer.
export interface AuthState {
  // One field, not four component booleans: only one auth modal is ever open,
  // they link to one another, and the transitions fire from the header, the
  // modals themselves and the URL.
  activeModal: ModalName | null;
  resetToken: string | null;
}

const initialState: AuthState = {
  activeModal: null,
  resetToken: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    openModal(state, action: PayloadAction<ModalName>) {
      state.activeModal = action.payload;
      state.resetToken = null;
    },
    openResetConfirm(state, action: PayloadAction<string>) {
      state.activeModal = 'resetConfirm';
      state.resetToken = action.payload;
    },
    closeModal(state) {
      state.activeModal = null;
      state.resetToken = null;
    },
  },
});

export const { openModal, openResetConfirm, closeModal } = authSlice.actions;
export const authReducer = authSlice.reducer;
