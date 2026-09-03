import type { FC } from 'react';
import { Empty, Typography } from 'antd';

export const ProfilePage: FC = () => {
  return (
    <>
      <Typography.Title level={2}>Profile</Typography.Title>
      <Empty description="Profile settings are not built yet." />
    </>
  );
};
