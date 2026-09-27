import type { FC } from 'react';
import { Alert, Empty, Tabs, Typography } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { FavoritesPanel } from '@/components/organisms/FavoritesPanel/FavoritesPanel';
import { MyBooksPanel } from '@/components/organisms/MyBooksPanel/MyBooksPanel';
import { ProfileSettings } from '@/components/organisms/ProfileSettings/ProfileSettings';
import { useSession } from '@/queries/auth';

// Each tab is its own path, unlike BookPage's tabs: the account menu and the
// book and series editors must open a given tab. The key is the path, so a
// tab change navigates to its key.
const ACCOUNT_TAB = '/profile';
const MY_BOOKS_TAB = '/profile/my-books';

export const ProfilePage: FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending, isError } = useSession();
  const title = <Typography.Title level={2}>Profile</Typography.Title>;

  // While the session is still resolving, showing the Empty state would
  // flash a log-in prompt at a signed-in user who loaded /profile directly,
  // and a non-author redirect would bounce an author reloading My Books.
  if (isPending) return title;

  // A failed session fetch — a 5xx or a network error, distinct from the
  // ordinary "nobody is signed in" 401, which the query already turns into
  // a `null` success — gets its own visible state.
  if (isError) {
    return (
      <>
        {title}
        <Alert type="error" title="Could not load your profile." />
      </>
    );
  }

  if (session === null) {
    return (
      <>
        {title}
        <Empty description="Log in to see your profile." />
      </>
    );
  }

  const isAuthor = session.role === 'author';
  // Reached only by a typed or old link: no tab leads here for a non-author.
  if (pathname === MY_BOOKS_TAB && !isAuthor) {
    return <Navigate replace to={ACCOUNT_TAB} />;
  }

  return (
    <>
      {title}
      <Tabs
        activeKey={pathname}
        onChange={(key) => void navigate(key)}
        items={[
          { key: ACCOUNT_TAB, label: 'Account', children: <ProfileSettings /> },
          {
            key: '/profile/favorites',
            label: 'Favorites',
            children: <FavoritesPanel />,
          },
          ...(isAuthor
            ? [
                {
                  key: MY_BOOKS_TAB,
                  label: 'My Books',
                  children: <MyBooksPanel authorId={session.id} />,
                },
              ]
            : []),
        ]}
      />
    </>
  );
};
