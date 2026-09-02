import { Avatar, Button, Dropdown, Layout, Menu, Skeleton, Space } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import type { MenuProps } from 'antd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logoutUser, openModal } from '../../store/authSlice';

export function AppHeader() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((state) => state.auth.user);
  const status = useAppSelector((state) => state.auth.status);

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

  function handleAccountClick({ key }: { key: string }) {
    if (key === 'logout') {
      void dispatch(logoutUser());
      return;
    }
    void navigate(key);
  }

  return (
    <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Menu
        theme="dark"
        mode="horizontal"
        items={navItems}
        selectedKeys={[location.pathname]}
        onClick={({ key }) => void navigate(key)}
        style={{ flex: 1, minWidth: 0 }}
      />

      {status !== 'ready' ? (
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
          <Button type="text" style={{ color: '#fff' }}>
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
}
