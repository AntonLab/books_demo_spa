import { Fragment } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router';
import type { PublicGenre } from 'shared';
import { searchPath } from '@/types/bookSearch';
import { GENRE_PATH_SEPARATOR, genreSegments } from '@/types/genreTree';

// Not antd's Breadcrumb: it adds a nav landmark, and a list shows one per card.
export const GenrePath: FC<{ genre: PublicGenre }> = ({ genre }) => (
  <span>
    {genreSegments(genre).map((segment, index) => (
      <Fragment key={segment.id}>
        {index > 0 && <span aria-hidden="true">{GENRE_PATH_SEPARATOR}</span>}
        <Link to={searchPath({ genre: String(segment.id) })}>
          {segment.name}
        </Link>
      </Fragment>
    ))}
  </span>
);
