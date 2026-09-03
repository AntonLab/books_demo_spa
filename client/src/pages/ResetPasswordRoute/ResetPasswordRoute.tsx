import { useEffect } from 'react';
import type { FC } from 'react';
import { useSearchParams } from 'react-router';
import { useAppDispatch } from '@/store/hooks';
import { openResetConfirm } from '@/store/authSlice';
import { MainPage } from '@/pages/MainPage';

// The emailed link is <APP_BASE_URL>/reset-password?token=... — built by
// `resetUrl()` in server/src/delivery/resetDelivery.ts, whose comment names
// this route as the contract. The path and the query key must not drift.
export const ResetPasswordRoute: FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      dispatch(openResetConfirm(token));
    }
  }, [dispatch, token]);

  return <MainPage />;
};
