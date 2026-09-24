import type { FC, ReactNode } from 'react';
import { Card as AntCard, Flex, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import type { PublicGenre } from '@/types/genre';
import type { AuthorSummary } from '@/types/user';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  // One of several cards in a list, the card links its level-4 title to `href`
  // and clamps the description. Without one it heads a page of its own: its
  // title *is* that page's level-2 heading and the description shows in full.
  href?: string;
  authors: AuthorSummary[];
  description: string;
  genre: PublicGenre | null;
  tags: string[];
  media?: ReactNode;
  footer?: ReactNode;
}

// What a reader is told about a Book or a Series, with every Co-author named
// under the title. BookCard and SeriesCard map their record onto it.
export const Card: FC<CardProps> = ({
  title,
  href,
  authors,
  description,
  genre,
  tags,
  media,
  footer,
}) => {
  const { token } = theme.useToken();

  return (
    <AntCard
      size="small"
      className={href === undefined ? styles.pageHeading : undefined}
    >
      {/* Flex, not Space: Space wraps each child in a div.ant-space-item
          that carries no flex rule of its own, so a flex style on a child
          beneath it does nothing. Flex's children are the flex items
          themselves, so the text column below really takes the rest of the
          row and can shrink at phone width, while the media keeps its
          size. */}
      <Flex align="start" gap={token.margin} className={styles.row}>
        {media}
        <div className={styles.body}>
          {href === undefined ? (
            <Typography.Title level={2} className={styles.title}>
              {title}
            </Typography.Title>
          ) : (
            <Typography.Title level={4} className={styles.title}>
              <Link to={href}>{title}</Link>
            </Typography.Title>
          )}

          <Space size={token.marginXS} wrap className={styles.line}>
            {authors.map((author, index) => (
              <Space key={author.id} size={4}>
                <AccountAvatar
                  avatarUrl={author.avatarUrl}
                  name={`${author.firstName} ${author.lastName}`}
                  size="small"
                />
                <Typography.Text type="secondary">
                  {`${author.firstName} ${author.lastName}${
                    index < authors.length - 1 ? ',' : ''
                  }`}
                </Typography.Text>
              </Space>
            ))}
          </Space>

          <Typography.Paragraph
            ellipsis={href === undefined ? false : { rows: 3 }}
            className={styles.description}
          >
            {description}
          </Typography.Paragraph>

          {genre !== null && (
            <div className={styles.line}>
              <Link to={`/search?genre=${genre.id}`}>{genre.name}</Link>
            </div>
          )}

          {tags.length > 0 && (
            <Space wrap size={[0, token.marginXS]} className={styles.line}>
              {tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
          )}

          {footer}
        </div>
      </Flex>
    </AntCard>
  );
};
