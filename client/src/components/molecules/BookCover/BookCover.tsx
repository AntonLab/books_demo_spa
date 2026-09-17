import { useState } from 'react';
import type { FC } from 'react';
import { theme, Typography } from 'antd';

interface BookCoverProps {
  coverUrl: string | null;
  title: string;
}

// K4: a 2:3 frame. The title sits right beside this in every place it
// renders (BookCard, BookPage), so the image is decorative and the
// placeholder's text is hidden from assistive technology.
export const BookCover: FC<BookCoverProps> = ({ coverUrl, title }) => {
  const { token } = theme.useToken();
  // Stores the URL that failed, not just a boolean: a fresh upload hands
  // this component a new `coverUrl` (`?v=<ms>`), and comparing it against
  // the URL that failed lets that new URL try loading again instead of
  // staying stuck on the placeholder from an unrelated, earlier failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = coverUrl !== null && coverUrl !== failedUrl;

  return (
    <div
      style={{
        width: token.appBookCoverWidth,
        height: token.appBookCoverWidth * 1.5,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: token.borderRadius,
        background: token.colorFillTertiary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showImage ? (
        <img
          src={coverUrl}
          alt=""
          onError={() => setFailedUrl(coverUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Typography.Paragraph
          aria-hidden="true"
          type="secondary"
          ellipsis={{ rows: 3 }}
          style={{ padding: token.paddingXS, textAlign: 'center', margin: 0 }}
        >
          {title}
        </Typography.Paragraph>
      )}
    </div>
  );
};
