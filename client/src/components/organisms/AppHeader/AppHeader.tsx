import type { FC } from 'react';
import { Button, Dropdown, Layout, Menu, Skeleton, Space, theme } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import type { MenuProps } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { openModal } from '@/store/authSlice';
import { useLogout, useSession } from '@/queries/auth';
import { useGenres } from '@/queries/genres';
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

  const genres = useGenres();
  // Empty covers all three cases the submenu must not appear in: loading,
  // failed, and a genuinely empty list.
  const genreItems = genres.data?.items ?? [];
  const isModerator = user?.role === 'admin' || user?.role === 'superadmin';

  const navItems: MenuProps['items'] = [
    { key: '/', label: 'Home' },
    ...(genreItems.length > 0
      ? [
          {
            key: 'genres',
            label: 'Genres',
            // Each child is keyed by its own target path, so the menu's
            // onClick navigates to the key like every other item.
            children: genreItems.map((genre) => ({
              key: `/search?genre=${genre.id}`,
              label: genre.name,
            })),
          },
        ]
      : []),
    // Only for an account holding the author Role: that is who can be credited
    // on a book, so nobody else has anything to find there.
    ...(user?.role === 'author'
      ? [{ key: '/my-books', label: 'My Books' }]
      : []),
  ];

  const accountItems: MenuProps['items'] = [
    { key: '/profile', label: 'Profile' },
    // Keeping the Genre list is a Moderator's job; no other Role is offered it.
    ...(isModerator ? [{ key: '/admin/genres', label: 'Manage genres' }] : []),
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
      {/* Two props the submenu needs, both explained in CLAUDE.md's Testing
          notes as well:
          - `disabledOverflow`: rc-menu puts every child past the first into an
            overflowDisabled context unless this is set, and such a SubMenu
            can never open. The visible-item count comes from ResizeObserver
            measurements jsdom never reports, so without this the submenu is
            unopenable in every test — and a content-measured horizontal menu
            collapses its items into "…" in a real browser, the same reason the
            Log in menu carries it.
          - `triggerSubMenuAction="click"`: the default is hover, which a touch
            device has no way to perform and which a test can only drive
            through rc-menu's open delay. */}
      <Menu
        theme="dark"
        mode="horizontal"
        disabledOverflow
        triggerSubMenuAction="click"
        items={navItems}
        // pathname + search, so a genre item whose key carries a query string
        // is highlighted on its own page while / and /my-books keep working.
        selectedKeys={[`${location.pathname}${location.search}`]}
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
        //
        // Two things only a real browser shows, since jsdom lays nothing out
        // and fires no default actions:
        // - `disabledOverflow`: a horizontal menu sized by its content has no
        //   width to measure, so without it the one item collapses into "…".
        // - `preventDefault`: the menu opens the modal on Enter's keydown,
        //   the modal moves focus to its close button, and the same keypress
        //   would then activate that button and shut the modal at once.
        <Menu
          theme="dark"
          mode="horizontal"
          selectable={false}
          disabledOverflow
          items={[{ key: 'login', label: 'Log in' }]}
          onClick={({ domEvent }) => {
            domEvent.preventDefault();
            dispatch(openModal('login'));
          }}
        />
      )}
    </Layout.Header>
  );
};
