import type { FC } from 'react';
import { Space, Tag, theme, Typography } from 'antd';
import { Link } from 'react-router';
import { BookCover } from '@/components/molecules/BookCover/BookCover';
import { Card } from '@/components/organisms/Card/Card';
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
  // The Book page's own header, so the card does not link to the page it is on.
  heading?: boolean;
}

export const BookCard: FC<BookCardProps> = ({
  book,
  tile = false,
  heading = false,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={book.title}
      href={heading ? undefined : `/books/${book.id}`}
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
          large={heading}
        />
      }
      subtitle={
        book.series === null ? undefined : (
          <Link to={`/series/${book.series.id}`}>
            {book.series.position === null
              ? book.series.title
              : `${book.series.title} · Book ${book.series.position}`}
          </Link>
        )
      }
      footer={
        <Space size={token.marginXS}>
          <Tag color={BOOK_STATUS_COLORS[book.status]}>
            {BOOK_STATUS_LABELS[book.status]}
          </Tag>
          {!tile && !heading && (
            <Typography.Text type="secondary">
              {formatDate(book.createdAt)}
            </Typography.Text>
          )}
        </Space>
      }
    />
  );
};
