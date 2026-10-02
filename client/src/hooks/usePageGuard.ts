import { useEffect } from 'react';
import { App } from 'antd';
import { useLocation, useNavigate } from 'react-router';

// 'pending' while what decides access is still loading; 'guest' when nobody is
// signed in; 'denied' when the Account may not open the page.
export type PageAccess = 'pending' | 'allowed' | 'guest' | 'denied';

export const ACCESS_DENIED_MESSAGE = "You don't have access to this page.";

// What the guard leaves in the router state for AppHeader to open Log in with.
export interface LoginReturnState {
  loginReturnTo: string;
}

// Returns whether the page may render. A page that gets `false` renders
// <PageSpinner />: the redirect happens in an effect, one render later.
export const usePageGuard = (
  access: PageAccess,
  deniedMessage?: string,
  deniedTo = '/'
): boolean => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (access === 'denied') {
      void message.error({
        content: deniedMessage ?? ACCESS_DENIED_MESSAGE,
        key: 'page-guard',
      });
      void navigate(deniedTo, { replace: true });
    } else if (access === 'guest') {
      const state: LoginReturnState = { loginReturnTo: pathname + search };
      void navigate('/', { replace: true, state });
    }
  }, [access, deniedMessage, deniedTo, message, navigate, pathname, search]);

  return access === 'allowed';
};
