import { screen } from '@testing-library/react';
import { AuthModals } from './AuthModals';
import { renderWithProviders } from '@/test/renderWithProviders';

const onOpen = jest.fn();
const onClose = jest.fn();

describe('AuthModals', () => {
  it('renders nothing when no modal is active', () => {
    const { container } = renderWithProviders(
      <AuthModals modal={null} onOpen={onOpen} onClose={onClose} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Asserted on the dialog's accessible name rather than a button, because
  // the modals link to one another and so share button labels.
  it.each([
    ['login', 'Log in'],
    ['register', 'Create an account'],
    ['resetRequest', 'Reset your password'],
  ] as const)('renders the %s modal when it is active', (modal, title) => {
    renderWithProviders(
      <AuthModals modal={modal} onOpen={onOpen} onClose={onClose} />
    );

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('mounts one modal at a time, never two', () => {
    renderWithProviders(
      <AuthModals modal="login" onOpen={onOpen} onClose={onClose} />
    );

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: 'Create an account' })
    ).not.toBeInTheDocument();
  });

  describe('the emailed reset link', () => {
    it('opens the confirm modal, over any other', () => {
      renderWithProviders(
        <AuthModals modal="login" onOpen={onOpen} onClose={onClose} />,
        { route: '/reset-password?token=tok-123' }
      );

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(
        screen.getByRole('dialog', { name: 'Choose a new password' })
      ).toBeInTheDocument();
    });

    it('opens nothing without a token', () => {
      const { container } = renderWithProviders(
        <AuthModals modal={null} onOpen={onOpen} onClose={onClose} />,
        { route: '/reset-password' }
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('opens nothing for a token on any other path', () => {
      const { container } = renderWithProviders(
        <AuthModals modal={null} onOpen={onOpen} onClose={onClose} />,
        { route: '/search?token=tok-123' }
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});
