import { useAppSelector } from '../../store/hooks';
import { LoginModal } from './LoginModal';
import { RegisterModal } from './RegisterModal';
import { ResetConfirmModal } from './ResetConfirmModal';
import { ResetRequestModal } from './ResetRequestModal';

// Renders only the active modal. Mounting one at a time keeps each form fresh
// on open and sidesteps antd's close/destroy props entirely.
export function AuthModals() {
  const activeModal = useAppSelector((state) => state.auth.activeModal);

  switch (activeModal) {
    case 'login':
      return <LoginModal />;
    case 'register':
      return <RegisterModal />;
    case 'resetRequest':
      return <ResetRequestModal />;
    case 'resetConfirm':
      return <ResetConfirmModal />;
    default:
      return null;
  }
}
