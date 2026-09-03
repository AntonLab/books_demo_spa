import type { FC } from 'react';
import { Card, Space, Tag, theme, Typography } from 'antd';
import type { PublicBook } from '@/types/book';

// `createdAt` is an ISO string on the wire, so it is parsed here rather than
// assumed to be a Date.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

interface BookCardProps {
  book: PublicBook;
}

// Description-led, with no author: the books table has no title column, and
// the list response carries `userId` but no name. Neither is an oversight.
export const BookCard: FC<BookCardProps> = ({ book }) => {
  const { token } = theme.useToken();

  return (
    <Card size="small">
      <Typography.Paragraph
        ellipsis={{ rows: 3 }}
        style={{ marginBottom: token.marginSM }}
      >
        {book.description}
      </Typography.Paragraph>

      {book.tags.length > 0 && (
        <Space
          wrap
          size={[0, token.marginXS]}
          style={{ marginBottom: token.marginXS }}
        >
          {book.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      )}

      <Typography.Text type="secondary">
        {formatDate(book.createdAt)}
      </Typography.Text>
    </Card>
  );
};
