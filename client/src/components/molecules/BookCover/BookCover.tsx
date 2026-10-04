import { useState } from 'react';
import type { FC } from 'react';
import { Typography } from 'antd';
import styles from './BookCover.module.css';

interface BookCoverProps {
  coverUrl: string | null;
  title: string;
  // Takes its container's width instead of the fixed cover width: a grid tile.
  fullWidth?: boolean;
  // Twice the list width, the list width on a phone: the page header.
  large?: boolean;
}

// A 2:3 frame. The title sits beside it everywhere (BookCard, BookPage), so
// the image and the placeholder's text are hidden from assistive technology.
export const BookCover: FC<BookCoverProps> = ({
  coverUrl,
  title,
  fullWidth = false,
  large = false,
}) => {
  // The failed URL, not a boolean: a fresh upload brings a new `coverUrl`
  // (`?v=<ms>`), which then gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = coverUrl !== null && coverUrl !== failedUrl;

  return (
    <div
      className={`${styles.frame} ${large ? styles.large : ''} ${fullWidth ? styles.fullWidth : ''}`}
    >
      {showImage ? (
        <img
          src={coverUrl}
          alt=""
          onError={() => setFailedUrl(coverUrl)}
          className={styles.image}
        />
      ) : (
        <Typography.Paragraph
          aria-hidden="true"
          type="secondary"
          ellipsis={{ rows: 3 }}
          className={styles.placeholder}
        >
          {title}
        </Typography.Paragraph>
      )}
    </div>
  );
};
