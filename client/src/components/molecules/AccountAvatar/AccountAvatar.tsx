import type { FC } from 'react';
import { Avatar } from 'antd';

interface AccountAvatarProps {
  avatarUrl: string | null;
  // Whatever the account's name resolves to at the call site — a login for
  // the header's own trigger, a full name in a byline — the first
  // character is the fallback shown when there is no picture (K5).
  name: string;
  size?: 'small' | 'default' | 'large';
}

export const AccountAvatar: FC<AccountAvatarProps> = ({
  avatarUrl,
  name,
  size = 'default',
}) => {
  return (
    <Avatar src={avatarUrl ?? undefined} size={size}>
      {name.charAt(0).toUpperCase()}
    </Avatar>
  );
};
