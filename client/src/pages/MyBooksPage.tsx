import { Empty, Typography } from 'antd';

export function MyBooksPage() {
  return (
    <>
      <Typography.Title level={2}>My Books</Typography.Title>
      <Empty description="Your books are not built yet." />
    </>
  );
}
