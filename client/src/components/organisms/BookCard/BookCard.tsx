import type { FC } from 'react';
import { Space, Tag, theme, Typography } from 'antd';
import { BookCover } from '@/components/molecules/BookCover';
import { Card } from '@/components/organisms/Card';
import { formatDate } from '@/format/date';
import { BOOK_STATUS_LABELS, type PublicBook } from '@/types/book';

interface BookCardProps {
  book: PublicBook;
}

// Linked to the book page, with its Cover beside the text and its status
// under it. The list response embeds the Co-authors, so no second request is
// needed to name them.
export const BookCard: FC<BookCardProps> = ({ book }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={book.title}
      href={`/books/${book.id}`}
      authors={book.authors}
      description={book.description}
      genre={book.genre}
      tags={book.tags}
      media={<BookCover coverUrl={book.coverUrl} title={book.title} />}
      footer={
        <Space size={token.marginXS}>
          <Tag color={book.status === 'draft' ? 'orange' : undefined}>
            {BOOK_STATUS_LABELS[book.status]}
          </Tag>
          <Typography.Text type="secondary">
            {formatDate(book.createdAt)}
          </Typography.Text>
        </Space>
      }
    />
  );
};
