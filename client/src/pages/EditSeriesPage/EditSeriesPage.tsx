import type { FC } from 'react';
import {
  Alert,
  Button,
  Divider,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { useNavigate, useParams } from 'react-router';
import { CoAuthorManager } from '@/components/organisms/CoAuthorManager/CoAuthorManager';
import { SeriesForm } from '@/components/organisms/SeriesForm/SeriesForm';
import { SeriesOrderList } from '@/components/organisms/SeriesOrderList/SeriesOrderList';
import { useSession } from '@/queries/auth';
import { useGenres } from '@/queries/genres';
import { useDeleteSeries, useSeries, useUpdateSeries } from '@/queries/series';
import styles from './EditSeriesPage.module.css';

export const EditSeriesPage: FC = () => {
  const navigate = useNavigate();
  const seriesId = Number(useParams().id);

  const { data: session } = useSession();
  const { data: series, isPending, isError } = useSeries(seriesId);
  const isCoAuthor =
    series?.authors.some((author) => author.id === session?.id) ?? false;
  // A Moderator may edit and delete any series, and order its books, but never
  // change its byline — CoAuthorManager stays read-only for one.
  const isModerator =
    session?.role === 'admin' || session?.role === 'superadmin';
  const mayEdit = Boolean(session) && (isCoAuthor || isModerator);

  const genres = useGenres();
  const update = useUpdateSeries(seriesId);
  const remove = useDeleteSeries(seriesId);

  if (isError) {
    return <Alert type="error" title="Could not load this series." />;
  }
  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  // Mirrors the server, which refuses anyone else with a 403.
  if (!session || !mayEdit) {
    return (
      <Alert type="warning" title="Only its co-authors can edit this series." />
    );
  }

  const handleDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => void navigate(isCoAuthor ? '/my-books' : '/'),
    });
  };

  return (
    <>
      <Typography.Title level={2}>Edit series</Typography.Title>

      {update.isSuccess && (
        <Alert type="success" title="Saved." className={styles.alert} />
      )}
      <SeriesForm
        // Keyed by the last save, so the fields reset to what the server
        // stored rather than keeping a stale copy of the loaded series.
        key={series.updatedAt}
        genreOptions={genres.data?.items ?? []}
        submitLabel="Save"
        initialValues={{
          title: series.title,
          description: series.description,
          tags: series.tags,
          genreId: series.genre?.id ?? null,
        }}
        isSubmitting={update.isPending}
        error={update.error?.message ?? null}
        onSubmit={(values) => update.mutate(values)}
      />

      <Divider />

      <SeriesOrderList
        seriesId={seriesId}
        mayEdit={mayEdit}
        isModerator={isModerator}
        viewerId={session.id}
      />

      <Divider />

      <CoAuthorManager
        work={{ kind: 'series', id: series.id }}
        authors={series.authors}
        viewerId={session.id}
        canManage={isCoAuthor}
        onLeave={() => void navigate('/my-books')}
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
