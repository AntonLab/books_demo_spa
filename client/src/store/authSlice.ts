import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { LoginInput, RegisterInput } from '../api/auth';
import type { PublicUser } from '../types/user';

// `as const` union rather than an enum, per the repository rules.
export const MODAL_NAMES = [
  'login',
  'register',
  'resetRequest',
  'resetConfirm',
] as const;
export type ModalName = (typeof MODAL_NAMES)[number];

// RTK serialises a thrown error and drops custom properties, so ApiError's
// `status` and `details` would not survive. Every thunk below rejects with this
// instead, which is what lets RegisterModal read `details.field` off a 409.
export interface AuthFailure {
  status: number;
  message: string;
  details?: unknown;
}

function toFailure(error: unknown): AuthFailure {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      details: error.details,
    };
  }
  return {
    status: 0,
    message: error instanceof Error ? error.message : 'Network error',
  };
}

export interface AuthState {
  user: PublicUser | null;
  status: 'idle' | 'loading' | 'ready';
  error: string | null;
  // One field, not four component booleans: only one auth modal is ever open,
  // they link to one another, and the transitions fire from the header, the
  // modals themselves and the URL.
  activeModal: ModalName | null;
  resetToken: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
  activeModal: null,
  resetToken: null,
};

export const bootstrapSession = createAsyncThunk<PublicUser | null>(
  'auth/bootstrapSession',
  async () => {
    try {
      return await authApi.me();
    } catch (error) {
      // A 401 means "not logged in" — the ordinary state for a first-time
      // visitor, and a success for this thunk. Rejecting here would flash an
      // error at every anonymous arrival.
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }
);

export const loginUser = createAsyncThunk<
  PublicUser,
  LoginInput,
  { rejectValue: AuthFailure }
>('auth/login', async (input, { rejectWithValue }) => {
  try {
    return await authApi.login(input);
  } catch (error) {
    return rejectWithValue(toFailure(error));
  }
});

export const registerUser = createAsyncThunk<
  PublicUser,
  RegisterInput,
  { rejectValue: AuthFailure }
>('auth/register', async (input, { rejectWithValue }) => {
  try {
    return await authApi.register(input);
  } catch (error) {
    return rejectWithValue(toFailure(error));
  }
});

export const logoutUser = createAsyncThunk<
  void,
  void,
  { rejectValue: AuthFailure }
>('auth/logout', async (_arg, { rejectWithValue }) => {
  try {
    await authApi.logout();
  } catch (error) {
    return rejectWithValue(toFailure(error));
  }
});

export const requestPasswordReset = createAsyncThunk<
  void,
  string,
  { rejectValue: AuthFailure }
>('auth/requestPasswordReset', async (email, { rejectWithValue }) => {
  try {
    await authApi.requestReset(email);
  } catch (error) {
    return rejectWithValue(toFailure(error));
  }
});

export const confirmPasswordReset = createAsyncThunk<
  void,
  { token: string; password: string },
  { rejectValue: AuthFailure }
>(
  'auth/confirmPasswordReset',
  async ({ token, password }, { rejectWithValue }) => {
    try {
      await authApi.confirmReset(token, password);
    } catch (error) {
      return rejectWithValue(toFailure(error));
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    openModal(state, action: PayloadAction<ModalName>) {
      state.activeModal = action.payload;
      state.error = null;
    },
    openResetConfirm(state, action: PayloadAction<string>) {
      state.activeModal = 'resetConfirm';
      state.resetToken = action.payload;
      state.error = null;
    },
    closeModal(state) {
      state.activeModal = null;
      state.resetToken = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.status = 'ready';
        state.user = action.payload;
        state.error = null;
      })
      .addCase(bootstrapSession.rejected, (state, action) => {
        // Reached only for non-401 failures; a 401 fulfils with null above.
        state.status = 'ready';
        state.user = null;
        state.error = action.error.message ?? null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'ready';
        state.activeModal = null;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'ready';
        state.activeModal = null;
        state.error = null;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.status = 'ready';
      });
  },
});

export const { openModal, openResetConfirm, closeModal } = authSlice.actions;
export const authReducer = authSlice.reducer;
