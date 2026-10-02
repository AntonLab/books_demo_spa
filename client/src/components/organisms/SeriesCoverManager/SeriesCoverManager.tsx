import type { FC } from 'react';
import { CoverManager } from '@/components/organisms/CoverManager/CoverManager';
import { useDeleteSeriesCover, useUploadSeriesCover } from '@/queries/series';

interface SeriesCoverManagerProps {
  seriesId: number;
  coverUrl: string | null;
  title: string;
}

// An organism rather than a molecule because it owns the upload and delete
// mutations, which CoverManager takes as props.
export const SeriesCoverManager: FC<SeriesCoverManagerProps> = ({
  seriesId,
  coverUrl,
  title,
}) => (
  <CoverManager
    coverUrl={coverUrl}
    title={title}
    upload={useUploadSeriesCover(seriesId)}
    remove={useDeleteSeriesCover(seriesId)}
  />
);
