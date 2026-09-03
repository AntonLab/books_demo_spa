import type { FC } from 'react';
import { Empty, Typography } from 'antd';

export const MyBooksPage: FC = () => {
  return (
    <>
      <Typography.Title level={2}>My Books</Typography.Title>
      <Empty description="Your books are not built yet." />
    </>
  );
};
