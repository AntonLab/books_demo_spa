import type { FC } from 'react';
import { Avatar } from 'antd';

interface AccountAvatarProps {
  avatarUrl: string | null;
  // A login in the header, a full name in a byline; its first character is the
  // fallback when there is no picture.
  name: string;
  size?: 'small' | 'default' | 'large';
}

// Decorative: a name sits beside it at every call site, so it would be read
// out twice. `AvatarProps` has no `aria-hidden`, so the wrapping <span> carries
// it.
export const AccountAvatar: FC<AccountAvatarProps> = ({
  avatarUrl,
  name,
  size = 'default',
}) => {
  return (
    <span aria-hidden="true">
      <Avatar src={avatarUrl ?? undefined} size={size} alt="">
        {name.charAt(0).toUpperCase()}
      </Avatar>
    </span>
  );
};
