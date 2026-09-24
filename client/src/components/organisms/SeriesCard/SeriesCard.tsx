import type { FC } from 'react';
import { Card } from '@/components/organisms/Card';
import type { PublicSeries } from '@/types/series';

interface SeriesCardProps {
  series: PublicSeries;
  // One of several cards in a list, it links to the series' own results —
  // there is no series page to send a reader to. Unlinked, it heads those
  // results itself.
  linked?: boolean;
}

// Its books are left to whoever renders this, since only they know which of
// them to list.
export const SeriesCard: FC<SeriesCardProps> = ({ series, linked = false }) => (
  <Card
    title={series.title}
    href={linked ? `/search?series=${series.id}` : undefined}
    authors={series.authors}
    description={series.description}
    genre={series.genre}
    tags={series.tags}
  />
);
