// The modals a click can open. The reset-confirm modal is not one of them:
// only the emailed link opens it, so the URL is its state.
export type AuthModalName = 'login' | 'register' | 'resetRequest';

export interface AuthModalProps {
  onOpen: (modal: AuthModalName) => void;
  onClose: () => void;
}
