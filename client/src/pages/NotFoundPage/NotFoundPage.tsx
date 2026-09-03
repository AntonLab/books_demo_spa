import type { FC } from 'react';
import { Button, Result, Typography } from 'antd';
import { Link } from 'react-router';

export const NotFoundPage: FC = () => {
  return (
    <Result
      status="404"
      title={<Typography.Title level={2}>Page not found</Typography.Title>}
      subTitle="That page does not exist."
      extra={
        <Link to="/">
          <Button type="primary">Back to books</Button>
        </Link>
      }
    />
  );
};
