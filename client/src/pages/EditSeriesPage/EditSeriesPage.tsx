import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Empty,
  Flex,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { useNavigate, useParams } from 'react-router';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager/CoAuthorManager';
import { SeriesEditDetailsModal } from '@/components/organisms/SeriesEditDetailsModal/SeriesEditDetailsModal';
import { SeriesOrderList } from '@/components/organisms/SeriesOrderList/SeriesOrderList';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { usePageGuard } from '@/hooks/usePageGuard';
import { useSession } from '@/queries/auth';
import { seriesCapabilities } from '@/types/capabilities';
import { useDeleteSeries, useSeries } from '@/queries/series';

export const EditSeriesPage: FC = () => {
  const seriesId = Number(useParams().id);
  // Not an id the server could answer for, so it is not asked.
  return Number.isInteger(seriesId) && seriesId > 0 ? (
    <EditSeriesView seriesId={seriesId} />
  ) : (
    <Empty description="This series no longer exists." />
  );
};

const EditSeriesView: FC<{ seriesId: number }> = ({ seriesId }) => {
  const navigate = useNavigate();

  const { data: session, isPending: sessionPending } = useSession();
  const { data: series, isPending, isError } = useSeries(seriesId);
  const [editing, setEditing] = useState(false);
  const remove = useDeleteSeries(seriesId);

  // The server refuses anyone but a co-author or Moderator with a 403.
  const allowed = usePageGuard(
    sessionPending
      ? 'pending'
      : !session
        ? 'guest'
        : !series
          ? 'pending'
          : seriesCapabilities(series, session).mayEdit
            ? 'allowed'
            : 'denied'
  );

  if (isError) {
    return <Alert type="error" title="Could not load this series." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // A Moderator may edit and delete any series, and order its books, but never
  // change its byline — CoAuthorManager stays read-only for one.
  if (!allowed || !session) return <PageSpinner />;
  const { isCoAuthor, mayEdit } = seriesCapabilities(series, session);

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(isCoAuthor ? '/profile/my-books' : '/'),
    });
  };

  return (
    <>
      <Flex justify="space-between" align="center">
        <Typography.Title level={2}>
          Manage series: {series.title}
        </Typography.Title>
        <Button onClick={() => setEditing(true)}>Edit details</Button>
      </Flex>
      {editing && (
        <SeriesEditDetailsModal
          seriesId={seriesId}
          onClose={() => setEditing(false)}
        />
      )}

      <Divider />

      <SeriesOrderList
        seriesId={seriesId}
        mayEdit={mayEdit}
        session={session}
      />

      <Divider />

      <CoAuthorManager
        work={{ kind: 'series', id: series.id }}
        authors={series.authors}
        viewerId={session.id}
        canManage={isCoAuthor}
        onLeave={() => void navigate('/profile/my-books')}
      />

      <Divider />

      <Space orientation="vertical">
        {remove.error && <Alert type="error" title={remove.error.message} />}
        <Popconfirm
          title="Delete this series?"
          description="Its books stay, outside any series."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={handleDelete}
        >
          <Button danger loading={remove.isPending}>
            Delete series
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
};
