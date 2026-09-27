import { NOTIFICATION_STREAM_EVENT } from 'shared';
import type { PublicNotification } from '../types/api';

export interface NotificationStreamHandlers {
  onNotification: (notification: PublicNotification) => void;
  // The browser has stopped reconnecting: the server answered something
  // other than 200, most often the 401 of a session that has ended.
  onClosed: () => void;
}

// A module of its own, not part of api/notifications.ts: tests automock that
// module, and an automocked opener would return undefined instead of a close
// function. The stream authenticates by the session cookie alone; there is no
// write, so no XSRF token.
export const openNotificationStream = ({
  onNotification,
  onClosed,
}: NotificationStreamHandlers): (() => void) => {
  const source = new EventSource('/api/notifications/stream', {
    withCredentials: true,
  });
  source.addEventListener(NOTIFICATION_STREAM_EVENT, (event) => {
    onNotification(JSON.parse(String(event.data)) as PublicNotification);
  });
  // An error while CONNECTING is the browser's own retry after a dropped
  // connection; only CLOSED needs the caller.
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED) onClosed();
  });
  return () => source.close();
};
