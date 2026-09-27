import type { FC } from 'react';
import { Alert, Empty, Typography } from 'antd';
import { ProfileSettings } from '@/components/organisms/ProfileSettings/ProfileSettings';
import { useSession } from '@/queries/auth';

export const ProfilePage: FC = () => {
  const { data: session, isPending, isError } = useSession();

  // While the session is still resolving, showing the Empty state would
  // flash a log-in prompt at a signed-in user who loaded /profile directly.
  if (isPending) {
    return <Typography.Title level={2}>Profile</Typography.Title>;
  }

  // A failed session fetch — a 5xx or a network error, distinct from the
  // ordinary "nobody is signed in" 401, which the query already turns into
  // a `null` success — gets its own visible state, the way EditBookPage,
  // MyBooksPage and EditChapterPage each report their own failed query.
  if (isError) {
    return (
      <>
        <Typography.Title level={2}>Profile</Typography.Title>
        <Alert type="error" title="Could not load your profile." />
      </>
    );
  }

  return (
    <>
      <Typography.Title level={2}>Profile</Typography.Title>

      {session === null ? (
        <Empty description="Log in to see your profile." />
      ) : (
        <ProfileSettings />
      )}
    </>
  );
};
