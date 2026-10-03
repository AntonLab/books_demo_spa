import type { FC } from 'react';
import { Descriptions, Typography } from 'antd';
import { AboutText } from '@/components/molecules/AboutText/AboutText';
import type { AccountProfile } from '@/types/api';

export const PublicProfileTab: FC<{ profile: AccountProfile }> = ({
  profile: { about, totals },
}) => (
  <>
    {about.trim() !== '' && (
      <>
        <Typography.Title level={4}>About</Typography.Title>
        <AboutText text={about} />
      </>
    )}
    <Descriptions
      column={{ xs: 1, sm: 2, md: 3 }}
      items={[
        {
          key: 'books-in-lists',
          label: 'Books in reading lists',
          children: totals.booksInReadingLists,
        },
        {
          key: 'series-in-lists',
          label: 'Series in reading lists',
          children: totals.seriesInReadingLists,
        },
        { key: 'book-likes', label: 'Book likes', children: totals.bookLikes },
        {
          key: 'series-likes',
          label: 'Series likes',
          children: totals.seriesLikes,
        },
        {
          key: 'comments',
          label: 'Comments on books',
          children: totals.commentsOnBooks,
        },
        { key: 'favorites', label: 'Favorites', children: totals.favorites },
      ]}
    />
  </>
);
