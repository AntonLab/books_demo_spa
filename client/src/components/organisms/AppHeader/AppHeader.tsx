import type { FC } from 'react';
import { Button, Dropdown, Layout, Menu, Skeleton, Space, theme } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import type { MenuProps } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { openModal } from '@/store/authSlice';
import { useLogout, useSession } from '@/queries/auth';
import { SearchBar } from '@/components/molecules/SearchBar';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { NotificationBell } from '@/components/organisms/NotificationBell';

export const AppHeader: FC = () => {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const logout = useLogout();
  const user = session.data;

  const navItems: MenuProps['items'] = [
    { key: '/', label: 'Home' },
    // Only for an account holding the author Role: that is who can be credited
    // on a book, so nobody else has anything to find there.
    ...(user?.role === 'author'
      ? [{ key: '/my-books', label: 'My Books' }]
      : []),
  ];

  const accountItems: MenuProps['items'] = [
    { key: '/profile', label: 'Profile' },
    { type: 'divider' },
    { key: 'logout', label: 'Log out' },
  ];

  const handleAccountClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout.mutate();
      return;
    }
    void navigate(key);
  };

  return (
    <Layout.Header
      style={{ display: 'flex', alignItems: 'center', gap: token.margin }}
    >
      <Menu
        theme="dark"
        mode="horizontal"
        items={navItems}
        selectedKeys={[location.pathname]}
        onClick={({ key }) => void navigate(key)}
        style={{ flex: 1, minWidth: 0 }}
      />

      <SearchBar />

      {session.isPending ? (
        // Not "Log in": showing it here would flash a logged-out header at a
        // logged-in user on every reload while GET /me is in flight.
        <Skeleton.Button active />
      ) : user ? (
        <Space>
          <NotificationBell userId={user.id} />
          <Dropdown
            menu={{ items: accountItems, onClick: handleAccountClick }}
            trigger={['click']}
          >
            {/* A native <button> (via antd's `type="text"`) rather than a
              bare <Space>/<div>: antd's Dropdown only grafts mouse/focus
              handlers onto its trigger child, never tabIndex or a role, so
              a non-interactive element here is invisible to keyboard
              navigation. A <Button> is focusable and Enter/Space-activated
              for free. */}
            <Button type="text" style={{ color: token.colorTextLightSolid }}>
              <Space>
                <AccountAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.login}
                  size="small"
                />
                {user.login}
              </Space>
            </Button>
          </Dropdown>
        </Space>
      ) : (
        // A menu of its own rather than an item in the one on the left: it
        // keeps Log in in the corner the account menu takes once signed in.
        // Not selectable, because it opens a modal instead of naming a route.
        // Registering is offered inside the login modal.
        <Menu
          theme="dark"
          mode="horizontal"
          selectable={false}
          items={[{ key: 'login', label: 'Log in' }]}
          onClick={() => dispatch(openModal('login'))}
        />
      )}
    </Layout.Header>
  );
};
