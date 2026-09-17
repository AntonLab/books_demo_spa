import type { FC } from 'react';
import { Card, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { BookCover } from '@/components/molecules/BookCover';
import { BOOK_STATUS_LABELS, type PublicBook } from '@/types/book';

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
      <Space align="start" size={token.margin} style={{ width: '100%' }}>
        <BookCover coverUrl={book.coverUrl} title={book.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            <Link to={`/books/${book.id}`}>{book.title}</Link>
          </Typography.Title>

          <Space
            size={token.marginXS}
            wrap
            style={{ marginBottom: token.marginXS }}
          >
            {book.authors.map((author, index) => (
              <Space key={author.id} size={4}>
                <AccountAvatar
                  avatarUrl={author.avatarUrl}
                  name={`${author.firstName} ${author.lastName}`}
                  size="small"
                />
                <Typography.Text type="secondary">
                  {`${author.firstName} ${author.lastName}${
                    index < book.authors.length - 1 ? ',' : ''
                  }`}
                </Typography.Text>
              </Space>
            ))}
          </Space>

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

          <Space size={token.marginXS}>
            <Tag color={book.status === 'draft' ? 'orange' : undefined}>
              {BOOK_STATUS_LABELS[book.status]}
            </Tag>
            <Typography.Text type="secondary">
              {formatDate(book.createdAt)}
            </Typography.Text>
          </Space>
        </div>
      </Space>
    </Card>
  );
};
