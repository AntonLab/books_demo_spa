import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    it('closes the reset-confirm modal opened by the URL without error', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        renderWithProviders(
          <AuthModals modal={null} onOpen={onOpen} onClose={onClose} />,
          { route: '/reset-password?token=abc' }
        );

        await userEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
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
