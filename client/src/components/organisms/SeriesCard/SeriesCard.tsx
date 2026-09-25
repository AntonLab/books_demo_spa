import type { FC } from 'react';
import { Card } from '@/components/organisms/Card/Card';
import type { PublicSeries } from '@/types/series';

interface SeriesCardProps {
  series: PublicSeries;
}

// Heads the series' own page, so its title is not a link. Its books are left
// to whoever renders this, since only they know which of them to list.
export const SeriesCard: FC<SeriesCardProps> = ({ series }) => (
  <Card
    title={series.title}
    authors={series.authors}
    description={series.description}
    genre={series.genre}
    tags={series.tags}
  />
);
