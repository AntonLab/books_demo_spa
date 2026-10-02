import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dropdown, Layout, Menu, Skeleton, Space } from 'antd';
import { queryKeys } from '@/queries/keys';
import type { LoginReturnState } from '@/hooks/usePageGuard';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { Link, useLocation, useNavigate } from 'react-router';
import type { MenuProps } from 'antd';
import { useSession } from '@/queries/auth';
import { isModeratorRole } from 'shared';
import { useGenresWithBooks } from '@/queries/genres';
import { searchPath } from '@/types/bookSearch';
import { buildGenreTree } from '@/types/genreTree';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import { useSignOut } from '@/store/useUnsavedText';
import { SearchBar } from '@/components/organisms/SearchBar/SearchBar';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { AuthModals } from '@/components/organisms/AuthModals/AuthModals';
import type { AuthModalName } from '@/components/organisms/AuthModals/AuthModals';
import { NotificationBell } from '@/components/organisms/NotificationBell/NotificationBell';
import headerImage from '../../../../public/header.svg';
import styles from './AppHeader.module.css';

export const AppHeader: FC = () => {
  // Held here because Log in is the only way into the modals from outside;
  // once open, they switch among themselves through the same setter.
  const [authModal, setAuthModal] = useState<AuthModalName | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const signOut = useSignOut();
  const user = session.data;
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.devicePreferences.theme);
  const queryClient = useQueryClient();
  // Where usePageGuard's Guest was headed; kept until Log in resolves.
  const [returnTo, setReturnTo] = useState<string | null>(null);

  // Read once per navigation, not per render: the router state outlives the
  // modal and must not reopen it each time the session changes. Any navigation,
  // the return trip included, also forgets the previous page.
  const [seenKey, setSeenKey] = useState(location.key);
  if (seenKey !== location.key) {
    setSeenKey(location.key);
    const loginReturnTo = (location.state as Partial<LoginReturnState> | null)
      ?.loginReturnTo;
    setReturnTo(loginReturnTo ?? null);
    if (loginReturnTo) setAuthModal('login');
  }

  useEffect(() => {
    if (user && returnTo) void navigate(returnTo, { replace: true });
  }, [user, returnTo, navigate]);

  const genres = useGenresWithBooks();
  // Empty covers all three cases the submenu must not appear in: loading,
  // failed, and a genuinely empty list.
  const genreNodes = buildGenreTree(genres.data?.items ?? []);
  const isModerator = isModeratorRole(user?.role);

  // Keyed by its own target path, so the menu's onClick navigates to the key
  // like every other item. The label is a real link too, for open-in-new-tab.
  const genreLeaf = (genre: { id: number; name: string }) => {
    const path = searchPath({ genre: String(genre.id) });
    return { key: path, label: <Link to={path}>{genre.name}</Link> };
  };

  const navItems: MenuProps['items'] = [
    { key: '/', label: 'Home' },
    ...(genreNodes.length > 0
      ? [
          {
            key: 'genres',
            label: 'Genres',
            children: genreNodes.map(({ item, children }) =>
              children.length === 0
                ? genreLeaf(item)
                : {
                    key: `genre-${item.id}`,
                    label: item.name,
                    // The Genre itself stays reachable: its title only opens
                    // the submenu.
                    children: [item, ...children].map(genreLeaf),
                  }
            ),
          },
        ]
      : []),
  ];

  const accountItems: MenuProps['items'] = [
    { key: '/profile', label: 'Profile' },
    { key: '/profile/favorites', label: 'Favorites' },
    // Only for an account holding the author Role: that is who can be credited
    // on a book, so nobody else has anything to find there.
    ...(user?.role === 'author'
      ? [{ key: '/profile/my-books', label: 'My works' }]
      : []),
    // Keeping the Genre list is an Admin's (or Superadmin's) job; no other
    // Role is offered it.
    ...(isModerator ? [{ key: '/admin/genres', label: 'Manage genres' }] : []),
    { type: 'divider' },
    { key: 'logout', label: 'Log out' },
  ];

  const handleAccountClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      signOut();
      return;
    }
    void navigate(key);
  };

  return (
    <Layout.Header className={styles.header}>
      <img src={headerImage} alt="" className={styles.logo} />
      {/* Two props the submenu needs:
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
        // is highlighted on its own page while / keeps working.
        selectedKeys={[`${location.pathname}${location.search}`]}
        // A click on a genre's own anchor is the Link's to handle (a
        // modifier-click opens a new tab); a keypress or a click beside the
        // anchor reaches only the item, so the menu navigates for those.
        onClick={({ key, domEvent }) => {
          if ((domEvent.target as Element).closest('a')) return;
          void navigate(key);
        }}
        className={styles.nav}
      />

      <SearchBar />

      {/* Offered to everyone, Guests included: a Device preference belongs
          to the device, not to an Account. The header itself stays dark in
          both themes. */}
      <IconButton
        type="text"
        className={styles.onDark}
        label={
          theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
        }
        onClick={() => dispatch(devicePreferences.themeToggled())}
      >
        {/* The label carries the meaning, so the glyph is decorative. */}
        <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
      </IconButton>

      {session.isPending ? (
        // Not "Log in": showing it here would flash a logged-out header at a
        // logged-in user on every reload while GET /me is in flight.
        <Skeleton.Button active />
      ) : user ? (
        <Space>
          {/* Keyed by the Account: a sign-in as someone else in this tab
              remounts the bell, and its toast holder takes the last
              Account's toasts with it. */}
          <NotificationBell key={user.id} userId={user.id} />
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
            <Button type="text" className={styles.account}>
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
            setAuthModal('login');
          }}
        />
      )}

      <AuthModals
        modal={authModal}
        onOpen={setAuthModal}
        onClose={() => {
          setAuthModal(null);
          // A successful Log in closes the modal after the session is set;
          // only a close with nobody signed in abandons the page.
          if (!queryClient.getQueryData(queryKeys.session)) setReturnTo(null);
        }}
      />
    </Layout.Header>
  );
};
