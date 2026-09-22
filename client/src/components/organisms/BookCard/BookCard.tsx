import type { FC } from 'react';
import { Card, Flex, Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { BookCover } from '@/components/molecules/BookCover';
import { formatDate } from '@/format/date';
import { BOOK_STATUS_LABELS, type PublicBook } from '@/types/book';

interface BookCardProps {
  book: PublicBook;
}

// Title-led and linked to the book page, with every Co-author named under the
// title: the list response embeds them, so no second request is needed.
export const BookCard: FC<BookCardProps> = ({ book }) => {
  const { token } = theme.useToken();

  return (
    <Card size="small">
      {/* Flex, not Space: Space wraps each child in a div.ant-space-item
          that carries no flex rule of its own, so a flex style on a child
          beneath it does nothing. Flex's children are the flex items
          themselves, so the text column below really takes the rest of the
          row and can shrink at phone width, while the cover keeps its
          size. */}
      <Flex align="start" gap={token.margin} style={{ width: '100%' }}>
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

          {book.genre !== null && (
            <div style={{ marginBottom: token.marginXS }}>
              <Link to={`/search?genre=${book.genre.id}`}>
                {book.genre.name}
              </Link>
            </div>
          )}

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
      </Flex>
    </Card>
  );
};
