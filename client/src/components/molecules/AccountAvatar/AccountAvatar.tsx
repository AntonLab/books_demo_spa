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

// Decorative: a name always sits beside this at every call site, so its
// picture (or fallback initial) would otherwise be read out twice — once as
// that name, once as this element's own `?v=` URL or initial letter.
// `AvatarProps` has no `aria-hidden` of its own, so the wrapping <span>
// carries it for the whole element rather than passing it through `Avatar`.
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
