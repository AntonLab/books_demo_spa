import type { FC } from 'react';
import { Alert, Tabs, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { usePageGuard } from '@/hooks/usePageGuard';
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

  // While the session is still resolving, a guest redirect would bounce a
  // signed-in user who loaded /profile directly, and a non-author redirect
  // would bounce an author reloading My Books. A failed fetch stays 'pending'
  // so the error Alert below shows instead of a redirect.
  const allowed = usePageGuard(
    isPending || isError
      ? 'pending'
      : session === null
        ? 'guest'
        : pathname === MY_BOOKS_TAB && session.role !== 'author'
          ? 'denied'
          : 'allowed'
  );
  if (isPending) return <PageSpinner />;

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

  // A non-author reaches My Books only by a typed or old link.
  if (!allowed || !session) return <PageSpinner />;

  const isAuthor = session.role === 'author';

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
