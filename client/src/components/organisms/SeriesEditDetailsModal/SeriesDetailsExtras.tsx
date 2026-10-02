import type { FC } from 'react';
import { Alert, Button, Divider, Popconfirm, Space } from 'antd';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager/CoAuthorManager';
import { DELETE_SERIES_CONFIRM } from '@/constants/deleteWork';
import { useDeleteSeries } from '@/queries/series';
import { seriesCapabilities } from '@/types/capabilities';
import type { SeriesDetail, PublicUser } from '@/types/api';

interface SeriesDetailsExtrasProps {
  series: SeriesDetail;
  session: PublicUser;
  onGone: () => void;
}

// What sits under the Details form: Co-authors and Delete series.
export const SeriesDetailsExtras: FC<SeriesDetailsExtrasProps> = ({
  series,
  session,
  onGone,
}) => {
  const remove = useDeleteSeries(series.id);
  // A Moderator may edit and delete any series, but never change its byline —
  // CoAuthorManager stays read-only for one.
  const { isCoAuthor } = seriesCapabilities(series, session);

  return (
    <>
      <Divider />

      <CoAuthorManager
        work={{ kind: 'series', id: series.id }}
        authors={series.authors}
        viewerId={session.id}
        canManage={isCoAuthor}
        onLeave={onGone}
      />

      <Divider />

      <Space orientation="vertical">
        {remove.error && <Alert type="error" title={remove.error.message} />}
        <Popconfirm
          {...DELETE_SERIES_CONFIRM}
          okButtonProps={{ danger: true }}
          onConfirm={() => remove.mutate(undefined, { onSuccess: onGone })}
        >
          <Button danger loading={remove.isPending}>
            Delete series
          </Button>
        </Popconfirm>
      </Space>
    </>
  );
};
