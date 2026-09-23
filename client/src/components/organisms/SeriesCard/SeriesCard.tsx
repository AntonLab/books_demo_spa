import type { FC } from 'react';
import { Card, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import type { PublicSeries } from '@/types/series';
import styles from './SeriesCard.module.css';

interface SeriesCardProps {
  series: PublicSeries;
  // Heading a page of its own results, the card's title *is* that page's
  // level-2 heading. One of several cards in a list, it is a level-4 link to
  // its own results instead — there is no series page to send a reader to.
  linked?: boolean;
}

// What a reader is told about a series: its title, every Co-author, the blurb,
// its Genre and its tags, the way BookCard tells them about a book. Its books
// are left to whoever renders this, since only they know which of them to list.
export const SeriesCard: FC<SeriesCardProps> = ({ series, linked = false }) => {
  const { token } = theme.useToken();

  return (
    <Card size="small" className={styles.card}>
      {linked ? (
        <Typography.Title level={4} className={styles.title}>
          <Link to={`/search?series=${series.id}`}>{series.title}</Link>
        </Typography.Title>
      ) : (
        <Typography.Title level={2} className={styles.title}>
          {series.title}
        </Typography.Title>
      )}

      <Space size={token.marginXS} wrap className={styles.line}>
        {series.authors.map((author, index) => (
          <Space key={author.id} size={4}>
            <AccountAvatar
              avatarUrl={author.avatarUrl}
              name={`${author.firstName} ${author.lastName}`}
              size="small"
            />
            <Typography.Text type="secondary">
              {`${author.firstName} ${author.lastName}${
                index < series.authors.length - 1 ? ',' : ''
              }`}
            </Typography.Text>
          </Space>
        ))}
      </Space>

      <Typography.Paragraph className={styles.description}>
        {series.description}
      </Typography.Paragraph>

      {series.genre !== null && (
        <div className={styles.line}>
          <Link to={`/search?genre=${series.genre.id}`}>
            {series.genre.name}
          </Link>
        </div>
      )}

      {series.tags.length > 0 && (
        <Space wrap size={[0, token.marginXS]}>
          {series.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      )}
    </Card>
  );
};
