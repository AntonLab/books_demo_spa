import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import { Badge, Button, Empty, Popover, Typography } from 'antd';
import { Link } from 'react-router';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/queries/notifications';
import { formatDateTime } from '@/format/date';
import type { CreditNotification, PublicNotification } from '@/types/api';
import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  // The signed-in account: its notifications are cached under its own key.
  userId: number;
}

const WORK_LABELS = { book: 'the book', series: 'the series' } as const;

// A book opens on its page; a series on its editor, since the public series
// page is still a stub. A New chapter opens its first new Chapter, or the Book
// once that Chapter is gone.
const hrefOf = (notification: PublicNotification): string | null => {
  const { work } = notification;
  if (work.id === null) return null;
  if (notification.kind === 'new_chapter' && notification.chapter.id !== null)
    return `/books/${work.id}/chapters/${notification.chapter.id}`;
  return work.type === 'book' ? `/books/${work.id}` : `/series/${work.id}/edit`;
};

const actorOf = ({ actor }: CreditNotification): string => {
  if (actor.kind === 'moderator') return 'A moderator';
  if (actor.kind === 'deleted_account') return 'A deleted account';
  return actor.name ?? 'A co-author';
};

// One notification as a sentence, with what it points at linked while that
// still exists.
const describe = (
  notification: PublicNotification,
  onFollow: () => void
): ReactNode => {
  const href = hrefOf(notification);
  const linked = (title: string) => {
    const quoted = `“${title}”`;
    return href === null ? (
      <strong>{quoted}</strong>
    ) : (
      <Link to={href} onClick={onFollow}>
        {quoted}
      </Link>
    );
  };

  if (notification.kind === 'new_chapter') {
    const book = <strong>“{notification.work.title}”</strong>;
    const chapter = linked(notification.chapter.title);
    return notification.chapterCount === 1 ? (
      <>
        New chapter in the book {book}: {chapter}.
      </>
    ) : (
      <>
        {notification.chapterCount} new chapters in the book {book}, starting
        with {chapter}.
      </>
    );
  }
  if (notification.kind === 'new_book') {
    return (
      <>
        New book in the series <strong>“{notification.series.title}”</strong>:{' '}
        {linked(notification.work.title)}.
      </>
    );
  }

  const work = (
    <>
      {WORK_LABELS[notification.work.type]} {linked(notification.work.title)}
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
        {/* The count is in the name as well as the badge, which a screen
            reader does not announce. */}
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
