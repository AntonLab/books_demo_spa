import type { FC } from 'react';
import { Card } from '@/components/organisms/Card/Card';
import type { PublicSeries } from '@/types/api';

interface SeriesCardProps {
  series: PublicSeries;
  href?: string;
}

// Without `href` the card heads the series' own page, so its title is not a
// link; with it the card is a list row. Its books are left to whoever renders
// this, since only they know which of them to list.
export const SeriesCard: FC<SeriesCardProps> = ({ series, href }) => (
  <Card
    title={series.title}
    href={href}
    authors={series.authors}
    description={series.description}
    genre={series.genre}
    tags={series.tags}
  />
);
