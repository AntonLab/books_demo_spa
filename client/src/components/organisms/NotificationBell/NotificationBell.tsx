import { useEffect, useState } from 'react';
import type { CSSProperties, FC, ReactNode } from 'react';
import { NOTIFICATION_READ_TTL_MS } from 'shared';
import {
  Badge,
  Button,
  Empty,
  Popover,
  Typography,
  notification as antdNotification,
} from 'antd';
import { Link, useNavigate } from 'react-router';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/queries/notifications';
import { useNotificationStream } from '@/queries/notificationStream';
import { formatDateTime } from '@/format/date';
import type { CreditNotification, PublicNotification } from '@/types/api';
import { COLLAPSE_MS } from './collapse';
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

const expiresAt = (readAt: string): number =>
  Date.parse(readAt) + NOTIFICATION_READ_TTL_MS;

const hasExpired = ({ readAt }: PublicNotification): boolean =>
  readAt !== null && expiresAt(readAt) <= Date.now();

interface NotificationRowProps {
  item: PublicNotification;
  fresh: boolean;
  onLeave: (id: number) => void;
  onFollow: () => void;
}

// A read row collapses and leaves once its minute is up, as the server stops
// listing it then. Its timers live only while the popover shows it.
const NotificationRow: FC<NotificationRowProps> = ({
  item,
  fresh,
  onLeave,
  onFollow,
}) => {
  const [leaving, setLeaving] = useState(false);
  const { id, readAt } = item;

  useEffect(() => {
    if (readAt === null) return;
    let removal: ReturnType<typeof setTimeout> | undefined;
    const collapse = setTimeout(
      () => {
        setLeaving(true);
        removal = setTimeout(() => onLeave(id), COLLAPSE_MS);
      },
      // readAt is server time: a browser clock behind it would otherwise hold
      // the row for the TTL plus the skew.
      Math.min(
        NOTIFICATION_READ_TTL_MS,
        Math.max(0, expiresAt(readAt) - Date.now())
      )
    );
    return () => {
      clearTimeout(collapse);
      clearTimeout(removal);
    };
    // onLeave is a fresh closure each render; restarting the timer on it would
    // push the row's exit back on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, readAt]);

  return (
    <li
      className={[
        styles.item,
        fresh ? styles.fresh : '',
        leaving ? styles.leaving : '',
      ].join(' ')}
      style={{ '--collapse-ms': `${COLLAPSE_MS}ms` } as CSSProperties}
    >
      <Typography.Paragraph className={styles.text}>
        {describe(item, onFollow)}
      </Typography.Paragraph>
      <Typography.Text type="secondary">
        {formatDateTime(item.createdAt)}
      </Typography.Text>
    </li>
  );
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
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());

  const navigate = useNavigate();
  const [toasts, toastHolder] = antdNotification.useNotification();

  // Keyed by the Notification's id: a New chapter that grows is pushed again
  // under the same id, and open() with a key already on screen updates that
  // toast in place.
  useNotificationStream(userId, (item) => {
    const key = `notification-${item.id}`;
    const href = hrefOf(item);
    const dismiss = () => toasts.destroy(key);
    toasts.open({
      key,
      title: 'New notification',
      description: describe(item, dismiss),
      actions: href !== null && (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            dismiss();
            void navigate(href);
          }}
        >
          Open
        </Button>
      ),
    });
  });

  const items = notifications.data?.items ?? [];
  // Ids the server has purged are forgotten, so the set cannot grow for ever.
  // Adjusted during render: it settles at once, as a pruned set has nothing
  // left to prune.
  const listed = new Set(items.map((item) => item.id));
  if ([...dismissed].some((id) => !listed.has(id))) {
    setDismissed(new Set([...dismissed].filter((id) => listed.has(id))));
  }
  const unread = notifications.data?.unread ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setFresh(new Set());
      return;
    }

    const unreadIds = items
      .filter((item) => item.readAt === null)
      .map((item) => item.id);
    setFresh(new Set(unreadIds));
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
  };

  const close = () => handleOpenChange(false);
  const dismiss = (id: number) =>
    setDismissed((previous) => new Set(previous).add(id));

  // Filtered at render as well as by the row timers, so a row that expired in
  // a stale cache never flashes up.
  const visible = items.filter(
    (item) => !dismissed.has(item.id) && !hasExpired(item)
  );

  const content = notifications.isError ? (
    <Typography.Text type="danger">
      Could not load your notifications.
    </Typography.Text>
  ) : visible.length === 0 ? (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="No notifications yet."
    />
  ) : (
    <ol className={styles.list}>
      {visible.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          fresh={fresh.has(item.id)}
          onLeave={dismiss}
          onFollow={close}
        />
      ))}
    </ol>
  );

  return (
    <>
      {toastHolder}
      <Popover
        trigger="click"
        placement="bottomRight"
        title="Notifications"
        content={content}
        open={open}
        onOpenChange={handleOpenChange}
        // Unmounts the rows once hidden, which clears their expiry timers.
        destroyOnHidden
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
    </>
  );
};
