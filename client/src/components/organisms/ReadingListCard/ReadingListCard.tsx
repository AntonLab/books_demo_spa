import type { FC } from 'react';
import { Space, Typography } from 'antd';
import { Card } from '@/components/organisms/Card/Card';
import type { PublicReadingList } from '@/types/readingList';

interface ReadingListCardProps {
  list: PublicReadingList;
  href?: string;
}

// Without `href` the card heads the list's own page, so its title is not a
// link; with it the card is a list row. `itemCount` counts only the items the
// viewer may see.
export const ReadingListCard: FC<ReadingListCardProps> = ({ list, href }) => (
  <Card
    title={list.title}
    href={href}
    authors={[]}
    description={list.description}
    genre={null}
    tags={list.tags}
    footer={
      <Space size="small">
        <Typography.Text type="secondary">{`by ${list.owner.login}`}</Typography.Text>
        <Typography.Text type="secondary">
          {list.itemCount === 1 ? '1 item' : `${list.itemCount} items`}
        </Typography.Text>
      </Space>
    }
  />
);
