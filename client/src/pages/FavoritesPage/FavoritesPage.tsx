import type { FC } from 'react';
import { Empty, Typography } from 'antd';
import { FavoritesPanel } from '@/components/organisms/FavoritesPanel/FavoritesPanel';
import { useSession } from '@/queries/auth';

export const FavoritesPage: FC = () => {
  const { data: session } = useSession();
  const title = <Typography.Title level={2}>Favorites</Typography.Title>;

  // undefined while the session loads: the title alone, no flash of the
  // Guest message.
  if (session === undefined) return title;
  if (session === null) {
    return (
      <>
        {title}
        <Empty description="Log in to see your favorites." />
      </>
    );
  }

  return (
    <>
      {title}
      <FavoritesPanel />
    </>
  );
};
