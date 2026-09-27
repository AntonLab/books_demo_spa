import type { FC } from 'react';
import { Alert, Typography } from 'antd';
import { MyBooksPanel } from '@/components/organisms/MyBooksPanel/MyBooksPanel';
import { useSession } from '@/queries/auth';

export const MyBooksPage: FC = () => {
  const { data: session } = useSession();
  const title = <Typography.Title level={2}>My Books</Typography.Title>;

  if (session?.role !== 'author') {
    return (
      <>
        {title}
        <Alert
          type="info"
          title="Books are kept here for accounts holding the author role."
        />
      </>
    );
  }

  return (
    <>
      {title}
      <MyBooksPanel authorId={session.id} />
    </>
  );
};
