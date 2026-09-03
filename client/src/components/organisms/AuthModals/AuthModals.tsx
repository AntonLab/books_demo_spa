import type { FC } from 'react';
import { useAppSelector } from '@/store/hooks';
import { LoginModal } from '@/components/organisms/LoginModal';
import { RegisterModal } from '@/components/organisms/RegisterModal';
import { ResetConfirmModal } from '@/components/organisms/ResetConfirmModal';
import { ResetRequestModal } from '@/components/organisms/ResetRequestModal';

// Renders only the active modal. Mounting one at a time keeps each form fresh
// on open and sidesteps antd's close/destroy props entirely.
export const AuthModals: FC = () => {
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
};
