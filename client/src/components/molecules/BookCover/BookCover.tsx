import { useState } from 'react';
import type { FC } from 'react';
import { Typography } from 'antd';
import styles from './BookCover.module.css';

interface BookCoverProps {
  coverUrl: string | null;
  title: string;
  // Takes its container's width instead of the fixed cover width: a grid tile.
  fullWidth?: boolean;
}

// K4: a 2:3 frame. The title sits right beside this in every place it
// renders (BookCard, BookPage), so the image is decorative and the
// placeholder's text is hidden from assistive technology.
export const BookCover: FC<BookCoverProps> = ({
  coverUrl,
  title,
  fullWidth = false,
}) => {
  // Stores the URL that failed, not just a boolean: a fresh upload hands
  // this component a new `coverUrl` (`?v=<ms>`), and comparing it against
  // the URL that failed lets that new URL try loading again instead of
  // staying stuck on the placeholder from an unrelated, earlier failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = coverUrl !== null && coverUrl !== failedUrl;

  return (
    <div className={`${styles.frame} ${fullWidth ? styles.fullWidth : ''}`}>
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
