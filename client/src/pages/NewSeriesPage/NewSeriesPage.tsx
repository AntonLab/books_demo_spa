import type { FC } from 'react';
import { Alert, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { SeriesForm } from '@/components/organisms/SeriesForm';
import { useSession } from '@/queries/auth';
import { useGenres } from '@/queries/genres';
import { useCreateSeries } from '@/queries/series';

// Creating collects only the series' own fields. It has no books and no other
// Co-authors yet, because both need a series to hang off; they are one step
// away on the edit page this leads to.
export const NewSeriesPage: FC = () => {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const genres = useGenres();
  const create = useCreateSeries();

  if (session?.role !== 'author') {
    return (
      <Alert
        type="info"
        title="Only an account holding the author role can create series."
      />
    );
  }

  return (
    <>
      <Typography.Title level={2}>New series</Typography.Title>
      <SeriesForm
        genreOptions={genres.data?.items ?? []}
        submitLabel="Create series"
        isSubmitting={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={(values) =>
          create.mutate(values, {
            onSuccess: (series) => void navigate(`/series/${series.id}/edit`),
          })
        }
      />
    </>
  );
};
