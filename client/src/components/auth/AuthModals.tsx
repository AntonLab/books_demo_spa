import { useAppSelector } from '../../store/hooks';
import { LoginModal } from './LoginModal';
import { RegisterModal } from './RegisterModal';

// Renders only the active modal. Mounting one at a time keeps each form fresh
// on open and sidesteps antd's close/destroy props entirely.
export function AuthModals() {
  const activeModal = useAppSelector((state) => state.auth.activeModal);

  switch (activeModal) {
    case 'login':
      return <LoginModal />;
    case 'register':
      return <RegisterModal />;
    default:
      return null;
  }
}
