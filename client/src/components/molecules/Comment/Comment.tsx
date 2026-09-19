import type { FC } from 'react';
import { Button, Space, theme, Typography } from 'antd';
import { AccountAvatar } from '@/components/molecules/AccountAvatar';
import { LikeButton } from '@/components/molecules/LikeButton';
import { formatDate } from '@/format/date';
import type { CommentWithAuthor, Tombstone } from '@/types/comment';

const TOMBSTONE_LABELS: Record<Tombstone, string> = {
  deleted: '[deleted]',
  removed: '[removed by moderator]',
};

interface CommentProps {
  comment: CommentWithAuthor;
  // False on a reply: the UI renders two levels, so a reply carries no Reply
  // button. The server stores arbitrary depth regardless — only this caps it.
  canReply: boolean;
  isOwn: boolean;
  canLike: boolean;
  onReply: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onLike: (comment: CommentWithAuthor) => void;
}

// The name is free because antd removed its own Comment component in v5, so
// there is no import collision. Built from Typography and Button rather than
// pulled from a dependency for the same reason.
export const Comment: FC<CommentProps> = ({
  comment,
  canReply,
  isOwn,
  canLike,
  onReply,
  onEdit,
  onDelete,
  onLike,
}) => {
  const { token } = theme.useToken();

  // A tombstone carries no author, no text and no controls — not even for the
  // person who deleted or removed it. It exists only so its replies keep a
  // parent to hang off; anything more would put back what deleting or
  // removing was meant to take away.
  if (comment.tombstone !== null) {
    return (
      <article style={{ marginBottom: token.marginSM }}>
        <Typography.Text type="secondary" italic>
          {TOMBSTONE_LABELS[comment.tombstone]}
        </Typography.Text>
      </article>
    );
  }

  return (
    <article style={{ marginBottom: token.marginSM }}>
      <Space size={token.marginXS}>
        {comment.author && (
          <AccountAvatar
            avatarUrl={comment.author.avatarUrl}
            name={`${comment.author.firstName} ${comment.author.lastName}`}
            size="small"
          />
        )}
        <Typography.Text strong>
          {comment.author
            ? `${comment.author.firstName} ${comment.author.lastName}`
            : ''}
        </Typography.Text>
        <Typography.Text type="secondary">
          {formatDate(comment.createdAt)}
        </Typography.Text>
      </Space>

      <Typography.Paragraph style={{ marginBottom: token.marginXS }}>
        {comment.text}
      </Typography.Paragraph>

      <Space size={token.marginXS}>
        {canLike && (
          <LikeButton
            count={comment.likeCount}
            likedId={comment.viewerLikeId}
            onToggle={() => onLike(comment)}
          />
        )}
        {canReply && (
          <Button type="text" size="small" onClick={() => onReply(comment.id)}>
            Reply
          </Button>
        )}
        {isOwn && (
          <>
            <Button type="text" size="small" onClick={() => onEdit(comment.id)}>
              Edit
            </Button>
            <Button
              type="text"
              size="small"
              danger
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </Button>
          </>
        )}
      </Space>
    </article>
  );
};
