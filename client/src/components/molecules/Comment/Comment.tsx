import { useState, type FC } from 'react';
import { Popconfirm, Space, Tag, theme, Typography } from 'antd';
import {
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { IconButton } from '@/components/molecules/IconButton/IconButton';
import { LikeButton } from '@/components/molecules/LikeButton/LikeButton';
import { NameLink } from '@/components/molecules/NameLink/NameLink';
import { formatDate } from '@/format/date';
import styles from './Comment.module.css';
import type { Tombstone } from 'shared';
import type { CommentWithAuthor } from '@/types/api';

export const TOMBSTONE_LABELS: Record<Tombstone, string> = {
  deleted: '[deleted]',
  removed: '[removed by moderator]',
};

const COLLAPSED_ROWS = 3;

interface CommentProps {
  comment: CommentWithAuthor;
  canReply: boolean;
  // Clamps the text to a few lines behind "Show more"; off where the whole
  // text must show, as above the reply composer.
  clamp?: boolean;
  isOwn: boolean;
  canLike: boolean;
  onReply: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onLike: (comment: CommentWithAuthor) => void;
  canReport: boolean;
  onReport: (id: number) => void;
  canModerate: boolean;
  onRemove: (id: number) => void;
  onRestore: (id: number) => void;
}

// The name is free because antd removed its own Comment component in v5, so
// there is no import collision. Built from Typography and Button rather than
// pulled from a dependency for the same reason.
export const Comment: FC<CommentProps> = ({
  comment,
  canReply,
  clamp = true,
  isOwn,
  canLike,
  onReply,
  onEdit,
  onDelete,
  onLike,
  canReport,
  onReport,
  canModerate,
  onRemove,
  onRestore,
}) => {
  const { token } = theme.useToken();
  const [confirming, setConfirming] = useState(false);

  // A tombstone carries no author, no text and no controls — not even for the
  // person who deleted or removed it — except a Moderator's Restore on a
  // Removed one. It exists only so its replies keep a parent to hang off;
  // anything more would put back what deleting or removing was meant to take
  // away.
  if (comment.tombstone !== null) {
    return (
      <article className={styles.comment}>
        <Space size={token.marginXS}>
          <Typography.Text type="secondary" italic>
            {TOMBSTONE_LABELS[comment.tombstone]}
          </Typography.Text>
          {comment.tombstone === 'removed' && canModerate && (
            <IconButton
              label="Restore"
              icon={<UndoOutlined />}
              size="small"
              type="text"
              onClick={() => onRestore(comment.id)}
            />
          )}
        </Space>
      </article>
    );
  }

  return (
    <article className={styles.comment}>
      <Space size={token.marginXS}>
        {comment.author && (
          <AccountAvatar
            avatarUrl={comment.author.avatarUrl}
            name={`${comment.author.firstName} ${comment.author.lastName}`}
            size="small"
          />
        )}
        <Typography.Text strong>
          {comment.author ? (
            <NameLink
              id={comment.author.id}
              name={`${comment.author.firstName} ${comment.author.lastName}`}
            />
          ) : (
            ''
          )}
        </Typography.Text>
        <Typography.Text type="secondary">
          {formatDate(comment.createdAt)}
        </Typography.Text>
        {comment.hasOpenReport && <Tag>Moderating</Tag>}
      </Space>

      <Typography.Paragraph
        className={styles.text}
        ellipsis={
          clamp && {
            rows: COLLAPSED_ROWS,
            expandable: 'collapsible',
            symbol: (expanded) => (expanded ? 'Show less' : 'Show more'),
          }
        }
      >
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
          <IconButton
            label="Reply"
            icon={<CommentOutlined />}
            size="small"
            type="text"
            onClick={() => onReply(comment.id)}
          />
        )}
        {isOwn && (
          <>
            <IconButton
              label="Edit"
              icon={<EditOutlined />}
              size="small"
              type="text"
              onClick={() => onEdit(comment.id)}
            />
            <IconButton
              label="Delete"
              icon={<DeleteOutlined />}
              size="small"
              type="text"
              danger
              onClick={() => onDelete(comment.id)}
            />
          </>
        )}
        {canModerate && (
          <Popconfirm
            title="Remove this comment?"
            okText="Yes, remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => onRemove(comment.id)}
            onOpenChange={setConfirming}
          >
            <IconButton
              label="Remove"
              icon={<StopOutlined />}
              size="small"
              type="text"
              danger
              tooltipHidden={confirming}
            />
          </Popconfirm>
        )}
        {canReport && (
          <IconButton
            label={
              comment.viewerReportedId !== null
                ? 'Reported'
                : comment.hasOpenReport
                  ? 'Already under review'
                  : 'Report'
            }
            icon={<FlagOutlined />}
            size="small"
            type="text"
            disabled={
              comment.viewerReportedId !== null || comment.hasOpenReport
            }
            onClick={() => onReport(comment.id)}
          />
        )}
      </Space>
    </article>
  );
};
