import type { FC } from 'react';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { StarFilled, StarOutlined } from '@ant-design/icons';

interface FavoriteButtonProps {
  count: number;
  // The viewer's own Favorite, straight from viewerFavoriteId: null means the
  // work is not one. Handing it back on click lets the caller delete that
  // row without a lookup, as LikeButton does.
  favoriteId: number | null;
  disabled?: boolean;
  onToggle: (favoriteId: number | null) => void;
}

export const FavoriteButton: FC<FavoriteButtonProps> = ({
  count,
  favoriteId,
  disabled = false,
  onToggle,
}) => {
  const isFavorite = favoriteId !== null;

  return (
    <IconButton
      type="text"
      size="small"
      disabled={disabled}
      aria-pressed={isFavorite}
      label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      icon={
        // The label and aria-pressed carry the state; the star beside the
        // count is decorative (ADR-0012).
        isFavorite ? <StarFilled aria-hidden /> : <StarOutlined aria-hidden />
      }
      onClick={() => onToggle(favoriteId)}
    >
      {count}
    </IconButton>
  );
};
