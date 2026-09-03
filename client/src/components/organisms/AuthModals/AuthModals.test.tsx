import { screen } from '@testing-library/react';
import { AuthModals } from './AuthModals';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { RootState } from '@/store';
import type { AuthState } from '@/store/authSlice';

function withModal(activeModal: AuthState['activeModal']): Partial<RootState> {
  return {
    auth: {
      user: null,
      status: 'ready',
      error: null,
      activeModal,
      resetToken: activeModal === 'resetConfirm' ? 'tok-123' : null,
    },
  };
}

describe('AuthModals', () => {
  it('renders nothing when no modal is active', () => {
    const { container } = renderWithProviders(<AuthModals />, {
      preloadedState: withModal(null),
    });

    expect(container).toBeEmptyDOMElement();
  });

  // Asserted on the dialog's accessible name rather than a button, because
  // the modals link to one another and so share button labels.
  it.each([
    ['login', 'Log in'],
    ['register', 'Create an account'],
    ['resetRequest', 'Reset your password'],
    ['resetConfirm', 'Choose a new password'],
  ] as const)('renders the %s modal when it is active', (modal, title) => {
    renderWithProviders(<AuthModals />, { preloadedState: withModal(modal) });

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('mounts one modal at a time, never two', () => {
    renderWithProviders(<AuthModals />, { preloadedState: withModal('login') });

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: 'Create an account' })
    ).not.toBeInTheDocument();
  });
});
