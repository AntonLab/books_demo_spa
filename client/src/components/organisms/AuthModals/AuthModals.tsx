import type { FC } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { LoginModal } from '@/components/organisms/LoginModal';
import { RegisterModal } from '@/components/organisms/RegisterModal';
import { ResetConfirmModal } from '@/components/organisms/ResetConfirmModal';
import { ResetRequestModal } from '@/components/organisms/ResetRequestModal';
import type { AuthModalName, AuthModalProps } from './AuthModals.types';

interface Props extends AuthModalProps {
  modal: AuthModalName | null;
}

// Renders only the active modal. Mounting one at a time keeps each form fresh
// on open and sidesteps antd's close/destroy props entirely.
export const AuthModals: FC<Props> = ({ modal, onOpen, onClose }) => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  // The emailed link is <APP_BASE_URL>/reset-password?token=... — built by
  // `resetUrl()` in server/src/delivery/resetDelivery.ts. The path and the
  // query key must not drift. Leaving the path closes the modal.
  const resetToken =
    pathname === '/reset-password' ? searchParams.get('token') : null;
  if (resetToken) {
    return <ResetConfirmModal token={resetToken} />;
  }

  switch (modal) {
    case 'login':
      return <LoginModal onOpen={onOpen} onClose={onClose} />;
    case 'register':
      return <RegisterModal onOpen={onOpen} onClose={onClose} />;
    case 'resetRequest':
      return <ResetRequestModal onOpen={onOpen} onClose={onClose} />;
    default:
      return null;
  }
};
