import type { FC } from 'react';
import {
  Avatar,
  Button,
  Dropdown,
  Layout,
  Menu,
  Skeleton,
  Space,
  theme,
} from 'antd';
import { useLocation, useNavigate } from 'react-router';
import type { MenuProps } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { openModal } from '@/store/authSlice';
import { useLogout, useSession } from '@/queries/auth';
import { SearchBar } from '@/components/molecules/SearchBar';

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
    { key: '/series', label: 'Series' },
    // Only for a signed-in user. This conditional entry is what makes logging
    // in and out visible in the UI rather than only in the store.
    ...(user ? [{ key: '/my-books', label: 'My Books' }] : []),
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
              {/* An initial rather than an icon, so `@ant-design/icons`
                  stays out of the dependency list. */}
              <Avatar size="small">{user.login.charAt(0).toUpperCase()}</Avatar>
              {user.login}
            </Space>
          </Button>
        </Dropdown>
      ) : (
        <Space>
          <Button onClick={() => dispatch(openModal('login'))}>Log in</Button>
          <Button
            type="primary"
            onClick={() => dispatch(openModal('register'))}
          >
            Register
          </Button>
        </Space>
      )}
    </Layout.Header>
  );
};
