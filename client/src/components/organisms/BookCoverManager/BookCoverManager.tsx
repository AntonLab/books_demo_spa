import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Popconfirm, Space, theme, Typography } from 'antd';
import { BookCover } from '@/components/molecules/BookCover';
import { ImageUploadButton } from '@/components/molecules/ImageUploadButton';
import { useDeleteBookCover, useUploadBookCover } from '@/queries/books';
import styles from './BookCoverManager.module.css';

interface BookCoverManagerProps {
  bookId: number;
  coverUrl: string | null;
  // Shown by BookCover as the placeholder when there is no cover image.
  title: string;
}

// The book's Cover and the two ways it changes. An organism rather than a
// molecule because it owns the upload and delete mutations; ImageUploadButton
// below it stays presentational, as ProfilePage's avatar block needs it to.
export const BookCoverManager: FC<BookCoverManagerProps> = ({
  bookId,
  coverUrl,
  title,
}) => {
  const { token } = theme.useToken();
  const uploadCover = useUploadBookCover(bookId);
  const deleteCover = useDeleteBookCover(bookId);
  const [coverError, setCoverError] = useState<string | null>(null);

  // A fresh attempt (a new pick, or another try at Remove) always clears
  // whatever error the last one left showing; the mutate call's own "pending"
  // action then carries that same reset into uploadCover/deleteCover's own
  // `error`, so nothing has to reconcile the two.
  const handleCoverFile = (file: File) => {
    setCoverError(null);
    uploadCover.mutate(file, {
      onError: (error) => setCoverError(error.message),
    });
  };

  const handleCoverReject = (message: string) => setCoverError(message);

  const handleRemoveCover = () => {
    setCoverError(null);
    deleteCover.mutate(undefined, {
      onError: (error) => setCoverError(error.message),
    });
  };

  return (
    <>
      <Typography.Title level={4}>Cover</Typography.Title>
      {coverError && (
        <Alert type="error" title={coverError} className={styles.error} />
      )}
      <Space align="start" size={token.margin}>
        <BookCover coverUrl={coverUrl} title={title} />
        <Space orientation="vertical">
          <ImageUploadButton
            label="Upload cover"
            loading={uploadCover.isPending}
            onFile={handleCoverFile}
            onReject={handleCoverReject}
          />
          {coverUrl !== null && (
            <Popconfirm
              title="Remove the cover?"
              okText="Yes, remove"
              okButtonProps={{ danger: true }}
              onConfirm={handleRemoveCover}
            >
              <Button danger loading={deleteCover.isPending}>
                Remove cover
              </Button>
            </Popconfirm>
          )}
        </Space>
      </Space>
    </>
  );
};
