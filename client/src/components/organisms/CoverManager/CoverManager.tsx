import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Popconfirm, Space, theme, Typography } from 'antd';
import { BookCover } from '@/components/molecules/BookCover/BookCover';
import { ImageUploadButton } from '@/components/molecules/ImageUploadButton/ImageUploadButton';
import spacing from '@/theme/spacing.module.css';

// A structural slice of a TanStack mutation, so any resource's upload/delete
// hook fits and the manager imports no API module.
export interface CoverMutation<TVariables> {
  mutate: (
    variables: TVariables,
    options: { onError: (error: Error) => void }
  ) => void;
  isPending: boolean;
}

interface CoverManagerProps {
  coverUrl: string | null;
  // Shown by BookCover as the placeholder when there is no cover image.
  title: string;
  upload: CoverMutation<File>;
  remove: CoverMutation<void>;
}

// A work's Cover and the two ways it changes. An organism rather than a
// molecule because it owns the error state around the mutations;
// ImageUploadButton below it stays presentational, as ProfilePage's avatar
// block needs it to. BookCover previews both Books and Series: a Series Cover
// is the same 2:3 frame with a title placeholder.
export const CoverManager: FC<CoverManagerProps> = ({
  coverUrl,
  title,
  upload,
  remove,
}) => {
  const { token } = theme.useToken();
  const [coverError, setCoverError] = useState<string | null>(null);

  // A fresh attempt (a new pick, or another try at Remove) always clears
  // whatever error the last one left showing; the mutate call's own "pending"
  // action then carries that same reset into upload/remove's own
  // `error`, so nothing has to reconcile the two.
  const handleCoverFile = (file: File) => {
    setCoverError(null);
    upload.mutate(file, {
      onError: (error) => setCoverError(error.message),
    });
  };

  const handleCoverReject = (message: string) => setCoverError(message);

  const handleRemoveCover = () => {
    setCoverError(null);
    remove.mutate(undefined, {
      onError: (error) => setCoverError(error.message),
    });
  };

  return (
    <>
      <Typography.Title level={4}>Cover</Typography.Title>
      {coverError && (
        <Alert type="error" title={coverError} className={spacing.gapBelow} />
      )}
      <Space align="start" size={token.margin}>
        <BookCover coverUrl={coverUrl} title={title} />
        <Space orientation="vertical">
          <ImageUploadButton
            label="Upload cover"
            loading={upload.isPending}
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
              <Button danger loading={remove.isPending}>
                Remove cover
              </Button>
            </Popconfirm>
          )}
        </Space>
      </Space>
    </>
  );
};
