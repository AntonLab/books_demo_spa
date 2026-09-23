import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import { Badge, Button, Empty, Popover, Typography } from 'antd';
import { Link } from 'react-router';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/queries/notifications';
import { formatDateTime } from '@/format/date';
import type { PublicNotification } from '@/types/notification';
import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  // The signed-in account: its notifications are cached under its own key.
  userId: number;
}

const WORK_LABELS = { book: 'the book', series: 'the series' } as const;

// A book opens on its page; a series on its editor, since the public series
// page is still a stub.
const hrefOf = ({ work }: PublicNotification): string | null => {
  if (work.id === null) return null;
  return work.type === 'book' ? `/books/${work.id}` : `/series/${work.id}/edit`;
};

const actorOf = ({ actor }: PublicNotification): string => {
  if (actor.kind === 'moderator') return 'A moderator';
  if (actor.kind === 'deleted_account') return 'A deleted account';
  return actor.name ?? 'A co-author';
};

// One notification as a sentence, with the work's title linked while the work
// still exists.
const describe = (
  notification: PublicNotification,
  onFollow: () => void
): ReactNode => {
  const href = hrefOf(notification);
  const quoted = `“${notification.work.title}”`;
  const work = (
    <>
      {WORK_LABELS[notification.work.type]}{' '}
      {href === null ? (
        <strong>{quoted}</strong>
      ) : (
        <Link to={href} onClick={onFollow}>
          {quoted}
        </Link>
      )}
    </>
  );
  const actor = actorOf(notification);

  switch (notification.kind) {
    case 'co_author_added':
      return (
        <>
          {actor} added you as a co-author of {work}.
        </>
      );
    case 'co_author_removed':
      return (
        <>
          {actor} removed you from the co-authors of {work}.
        </>
      );
    case 'co_author_left':
      return (
        <>
          {actor} left the co-authors of {work}.
        </>
      );
    case 'co_author_account_deleted':
      return (
        <>
          {actor} is no longer a co-author of {work}.
        </>
      );
    case 'work_deleted':
      return (
        <>
          {actor} deleted {work}.
        </>
      );
  }
};

// The header's bell: the unread count on a badge, and the newest notifications
// behind it. Opening the panel marks what was unread as read on the server
// straight away, but keeps those rows highlighted until it closes, so the
// reader can still tell which ones are new.
export const NotificationBell: FC<NotificationBellProps> = ({ userId }) => {
  const notifications = useNotifications(userId);
  const markRead = useMarkNotificationsRead(userId);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setFresh(new Set());
      return;
    }

    const unreadIds = items
      .filter((item) => !item.isRead)
      .map((item) => item.id);
    setFresh(new Set(unreadIds));
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
  };

  const close = () => handleOpenChange(false);

  const content = notifications.isError ? (
    <Typography.Text type="danger">
      Could not load your notifications.
    </Typography.Text>
  ) : items.length === 0 ? (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="No notifications yet."
    />
  ) : (
    <ol className={styles.list}>
      {items.map((item) => (
        <li
          key={item.id}
          className={`${styles.item} ${fresh.has(item.id) ? styles.fresh : ''}`}
        >
          <Typography.Paragraph className={styles.text}>
            {describe(item, close)}
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            {formatDateTime(item.createdAt)}
          </Typography.Text>
        </li>
      ))}
    </ol>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title="Notifications"
      content={content}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <Badge count={unread} size="small">
        {/* A text glyph, like LikeButton's: @ant-design/icons is not a
            dependency here. The count is in the name as well as the badge,
            which a screen reader does not announce. */}
        <Button
          type="text"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
          }
          className={styles.bell}
        >
          🔔
        </Button>
      </Badge>
    </Popover>
  );
};
