import type { FC } from 'react';
import { Tabs, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router';
import { isModeratorRole } from 'shared';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { GenreManager } from '@/components/organisms/GenreManager/GenreManager';
import { ReportsPanel } from '@/components/organisms/ReportsPanel/ReportsPanel';
import { usePageGuard } from '@/hooks/usePageGuard';
import { useSession } from '@/queries/auth';

// The Admin panel is for an Admin or Superadmin (ADR-0008). Every other Role
// is sent home, and because the panels are separate components they make no
// request at all.
export const AdminPage: FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const allowed = usePageGuard(
    isPending
      ? 'pending'
      : !session
        ? 'guest'
        : isModeratorRole(session.role)
          ? 'allowed'
          : 'denied'
  );
  if (!allowed) return <PageSpinner />;

  return (
    <>
      <Typography.Title level={2}>Admin panel</Typography.Title>
      {/* The tabs are paths so the menu and a reload land on a tab, and a
          hidden panel must not keep its queries alive. */}
      <Tabs
        activeKey={pathname}
        onChange={(key) => void navigate(key)}
        items={[
          {
            key: '/admin/reports',
            label: 'Reports',
            destroyOnHidden: true,
            children: <ReportsPanel />,
          },
          {
            key: '/admin/genres',
            label: 'Genres',
            destroyOnHidden: true,
            children: <GenreManager />,
          },
        ]}
      />
    </>
  );
};
