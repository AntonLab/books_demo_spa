import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Popconfirm, Space, theme } from 'antd';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { ImageUploadButton } from '@/components/molecules/ImageUploadButton/ImageUploadButton';
import { EmailNotificationsSetting } from '@/components/organisms/EmailNotificationsSetting/EmailNotificationsSetting';
import { AccountDetailsForm } from '@/components/organisms/AccountDetailsForm/AccountDetailsForm';
import { ChangePasswordForm } from '@/components/organisms/ChangePasswordForm/ChangePasswordForm';
import { DevicePreferencesReset } from '@/components/organisms/DevicePreferencesReset/DevicePreferencesReset';
import { useSession } from '@/queries/auth';
import { useDeleteAvatar, useUploadAvatar } from '@/queries/users';

// The signed-in Account's avatar, details, password, email setting and device
// resets. ProfilePage renders it
// only once the session holds a PublicUser.
export const ProfileSettings: FC = () => {
  const { token } = theme.useToken();
  const { data: session } = useSession();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // The hooks run before the guard below, so session?.id falls back to 0, an
  // id that is never used.
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

  if (!session) return null;

  return (
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
      <EmailNotificationsSetting />
      <div style={{ maxWidth: token.controlHeightLG * 10 }}>
        <Space
          orientation="vertical"
          size={token.marginLG}
          style={{ width: '100%' }}
        >
          <AccountDetailsForm user={session} />
          <ChangePasswordForm userId={session.id} />
          <DevicePreferencesReset />
        </Space>
      </div>
    </Space>
  );
};
