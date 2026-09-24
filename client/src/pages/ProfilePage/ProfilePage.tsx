import { useState } from 'react';
import type { FC } from 'react';
import {
  Alert,
  Button,
  Empty,
  Popconfirm,
  Space,
  theme,
  Typography,
} from 'antd';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { ImageUploadButton } from '@/components/molecules/ImageUploadButton/ImageUploadButton';
import { useSession } from '@/queries/auth';
import { useDeleteAvatar, useUploadAvatar } from '@/queries/users';

export const ProfilePage: FC = () => {
  const { token } = theme.useToken();
  const { data: session, isPending, isError } = useSession();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // The hooks always run, even before a session exists: session?.id falls
  // back to 0, an id that is never used, since the avatar block below only
  // renders once `session` is a signed-in PublicUser.
  const upload = useUploadAvatar(session?.id ?? 0);
  const remove = useDeleteAvatar(session?.id ?? 0);

  // A fresh attempt (a new pick, or another try at Remove) always clears
  // whatever error the last one left showing.
  const handleAvatarFile = (file: File) => {
    setAvatarError(null);
    upload.mutate(file, { onError: (error) => setAvatarError(error.message) });
  };

  const handleAvatarReject = (message: string) => setAvatarError(message);

  const handleRemoveAvatar = () => {
    setAvatarError(null);
    remove.mutate(undefined, {
      onError: (error) => setAvatarError(error.message),
    });
  };

  // While the session is still resolving, showing the Empty state would
  // flash a log-in prompt at a signed-in user who loaded /profile directly,
  // and the avatar block cannot render without an id.
  if (isPending) {
    return <Typography.Title level={2}>Profile</Typography.Title>;
  }

  // A failed session fetch — a 5xx or a network error, distinct from the
  // ordinary "nobody is signed in" 401, which the query already turns into
  // a `null` success — gets its own visible state, the way EditBookPage,
  // MyBooksPage and EditChapterPage each report their own failed query.
  if (isError) {
    return (
      <>
        <Typography.Title level={2}>Profile</Typography.Title>
        <Alert type="error" title="Could not load your profile." />
      </>
    );
  }

  return (
    <>
      <Typography.Title level={2}>Profile</Typography.Title>

      {session === null ? (
        <Empty description="Log in to see your profile." />
      ) : (
        <Space orientation="vertical" size={token.margin}>
          {avatarError && <Alert type="error" title={avatarError} />}
          <AccountAvatar
            avatarUrl={session.avatarUrl}
            name={session.login}
            size="large"
          />
          <Space>
            <ImageUploadButton
              label="Upload avatar"
              loading={upload.isPending}
              onFile={handleAvatarFile}
              onReject={handleAvatarReject}
            />
            {session.avatarUrl !== null && (
              <Popconfirm
                title="Remove your avatar?"
                okText="Remove"
                okButtonProps={{ danger: true }}
                onConfirm={handleRemoveAvatar}
              >
                <Button danger loading={remove.isPending}>
                  Remove avatar
                </Button>
              </Popconfirm>
            )}
          </Space>
        </Space>
      )}
    </>
  );
};
