import type { FC } from 'react';
import { Card, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import type { PublicBook } from '@/types/book';

// `createdAt` is an ISO string on the wire, so it is parsed here rather than
// assumed to be a Date.
const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString();
};

interface BookCardProps {
  book: PublicBook;
}

// Title-led and linked to the book page, with every Co-author named under the
// title: the list response embeds them, so no second request is needed.
export const BookCard: FC<BookCardProps> = ({ book }) => {
  const { token } = theme.useToken();

  return (
    <Card size="small">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        <Link to={`/books/${book.id}`}>{book.title}</Link>
      </Typography.Title>

      <Typography.Text
        type="secondary"
        style={{ display: 'block', marginBottom: token.marginXS }}
      >
        {book.authors
          .map((author) => `${author.firstName} ${author.lastName}`)
          .join(', ')}
      </Typography.Text>

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
