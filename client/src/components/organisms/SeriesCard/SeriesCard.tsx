import type { FC } from 'react';
import { Card, Space, Tag, theme, Typography } from 'antd';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import type { PublicSeries } from '@/types/series';

interface SeriesCardProps {
  series: PublicSeries;
}

// What a reader is told about a series: its title, every Co-author, the blurb
// and its tags, the way BookCard tells them about a book. Its books are left
// to whoever renders this, since only they know which of them to list.
export const SeriesCard: FC<SeriesCardProps> = ({ series }) => {
  const { token } = theme.useToken();

  return (
    <Card size="small" style={{ marginBottom: token.margin }}>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {series.title}
      </Typography.Title>

      <Space
        size={token.marginXS}
        wrap
        style={{ marginBottom: token.marginXS }}
      >
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

      <Typography.Paragraph style={{ marginBottom: token.marginSM }}>
        {series.description}
      </Typography.Paragraph>

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
