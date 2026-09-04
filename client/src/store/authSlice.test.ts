import { createAppStore } from './index';
import { closeModal, openModal, openResetConfirm } from './authSlice';

describe('authSlice modal actions', () => {
  it('starts with no modal open', () => {
    const store = createAppStore();

    expect(store.getState().auth).toEqual({
      activeModal: null,
      resetToken: null,
    });
  });

  it('opens a named modal', () => {
    const store = createAppStore();

    store.dispatch(openModal('register'));

    expect(store.getState().auth.activeModal).toBe('register');
  });

  it('opens the confirm modal with the token from the URL', () => {
    const store = createAppStore();

    store.dispatch(openResetConfirm('tok-123'));

    expect(store.getState().auth).toEqual({
      activeModal: 'resetConfirm',
      resetToken: 'tok-123',
    });
  });

  it('drops a stale token when another modal opens', () => {
    const store = createAppStore();
    store.dispatch(openResetConfirm('tok-123'));

    store.dispatch(openModal('login'));

    expect(store.getState().auth.resetToken).toBeNull();
  });

  it('clears the modal and the token on close', () => {
    const store = createAppStore();
    store.dispatch(openResetConfirm('tok-123'));

    store.dispatch(closeModal());

    expect(store.getState().auth).toEqual({
      activeModal: null,
      resetToken: null,
    });
  });
});
