import type { FC } from 'react';
import { SeriesCard } from '@/components/organisms/SeriesCard/SeriesCard';
import type { ProfileScope } from '@/types/profileScope';
import { ProfileListShell } from './ProfileListShell';
import { useProfileSeries } from './useProfileLists';
import { SeriesRowActions } from './WorkRowActions';

interface ProfileSeriesListProps {
  scope: ProfileScope;
  viewerId: number;
  onEdit: (seriesId: number) => void;
}

export const ProfileSeriesList: FC<ProfileSeriesListProps> = ({
  scope,
  viewerId,
  onEdit,
}) => {
  const { list, ...filters } = useProfileSeries(scope, viewerId);
  return (
    <ProfileListShell
      scope={scope}
      kind="series"
      filters={filters}
      list={list}
      renderCard={(row) => (
        <SeriesCard series={row} href={`/series/${row.id}`} />
      )}
      renderActions={(row) => (
        <SeriesRowActions
          scope={scope}
          series={row}
          onEdit={() => onEdit(row.id)}
        />
      )}
    />
  );
};
