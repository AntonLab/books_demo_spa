import type { FC } from 'react';
import { Button, Space, theme, Typography } from 'antd';
import { LikeButton } from '@/components/molecules/LikeButton';
import type { CommentWithAuthor } from '@/types/comment';

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
  // person who deleted it. It exists only so its replies keep a parent to hang
  // off; anything more would put back what deleting was meant to remove.
  if (comment.isDeleted) {
    return (
      <article style={{ marginBottom: token.marginSM }}>
        <Typography.Text type="secondary" italic>
          [deleted]
        </Typography.Text>
      </article>
    );
  }

  return (
    <article style={{ marginBottom: token.marginSM }}>
      <Space size={token.marginXS}>
        <Typography.Text strong>
          {comment.author
            ? `${comment.author.firstName} ${comment.author.lastName}`
            : ''}
        </Typography.Text>
        <Typography.Text type="secondary">
          {new Date(comment.createdAt).toLocaleDateString()}
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
