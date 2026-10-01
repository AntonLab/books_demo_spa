import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
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
import { useSession } from '@/queries/auth';
import { seriesCapabilities } from '@/types/capabilities';
import { useDeleteSeries, useSeries } from '@/queries/series';

export const EditSeriesPage: FC = () => {
  const navigate = useNavigate();
  const seriesId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: series, isPending, isError } = useSeries(seriesId);
  const [editing, setEditing] = useState(false);
  const remove = useDeleteSeries(seriesId);

  if (isError) {
    return <Alert type="error" title="Could not load this series." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // A Moderator may edit and delete any series, and order its books, but never
  // change its byline — CoAuthorManager stays read-only for one.
  const { isCoAuthor, mayEdit } = seriesCapabilities(series, session);
  // The server refuses anyone else with a 403.
  if (!session || !mayEdit) {
    return (
      <Alert type="warning" title="Only its co-authors can edit this series." />
    );
  }

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

      <Space direction="vertical">
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
