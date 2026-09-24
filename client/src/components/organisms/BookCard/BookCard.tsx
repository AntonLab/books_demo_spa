import type { FC } from 'react';
import { Space, Tag, theme, Typography } from 'antd';
import { BookCover } from '@/components/molecules/BookCover';
import { Card } from '@/components/organisms/Card';
import { formatDate } from '@/format/date';
import {
  BOOK_STATUS_COLORS,
  BOOK_STATUS_LABELS,
  type PublicBook,
} from '@/types/book';

interface BookCardProps {
  book: PublicBook;
  // A grid cell: the Cover over the title, and only the status beneath.
  tile?: boolean;
}

// Linked to the book page, with its Cover beside the text and its status
// under it. The list response embeds the Co-authors, so no second request is
// needed to name them.
export const BookCard: FC<BookCardProps> = ({ book, tile = false }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={book.title}
      href={`/books/${book.id}`}
      tile={tile}
      authors={book.authors}
      description={tile ? undefined : book.description}
      genre={book.genre}
      tags={book.tags}
      media={
        <BookCover
          coverUrl={book.coverUrl}
          title={book.title}
          fullWidth={tile}
        />
      }
      footer={
        <Space size={token.marginXS}>
          <Tag color={BOOK_STATUS_COLORS[book.status]}>
            {BOOK_STATUS_LABELS[book.status]}
          </Tag>
          {!tile && (
            <Typography.Text type="secondary">
              {formatDate(book.createdAt)}
            </Typography.Text>
          )}
        </Space>
      }
    />
  );
};
