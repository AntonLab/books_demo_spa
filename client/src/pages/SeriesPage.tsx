import { Empty, Typography } from 'antd';

// A stub by design: series UI is an explicit non-goal of this spec. The nav
// entry exists so the shape of the app is visible.
export function SeriesPage() {
  return (
    <>
      <Typography.Title level={2}>Series</Typography.Title>
      <Empty description="Series are not built yet." />
    </>
  );
}
