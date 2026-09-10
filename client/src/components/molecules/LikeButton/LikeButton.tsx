import type { FC } from 'react';
import { Button } from 'antd';

interface LikeButtonProps {
  count: number;
  // The viewer's own like row, straight from viewerLikeId: null means they have
  // not liked this. Passing it back out on click is what lets the caller delete
  // the right row without a second lookup.
  likedId: number | null;
  disabled?: boolean;
  onToggle: (likedId: number | null) => void;
}

export const LikeButton: FC<LikeButtonProps> = ({
  count,
  likedId,
  disabled = false,
  onToggle,
}) => {
  const liked = likedId !== null;

  return (
    <Button
      type="text"
      size="small"
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike' : 'Like'}
      onClick={() => onToggle(likedId)}
    >
      {/* A text glyph rather than @ant-design/icons: that package is not a
          dependency of this workspace, and one button does not justify adding
          one. aria-pressed and the label carry the state for a screen reader,
          so the glyph is decorative. */}
      <span aria-hidden="true">{liked ? '♥' : '♡'}</span> {count}
    </Button>
  );
};
