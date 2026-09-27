import { request } from './client';
import type { NotificationList, NotificationSettings } from '../types/api';

// The newest page is all the bell shows; older notifications stay stored.
const NOTIFICATIONS_PAGE_SIZE = 20;

// Always the signed-in account's own: the server takes whose from the session.
export const listNotifications = (): Promise<NotificationList> => {
  return request<NotificationList>(
    `/notifications?limit=${NOTIFICATIONS_PAGE_SIZE}`
  );
};

// Marks the ones seen; ids that are not the caller's are ignored. Answers with
// how many are still unread.
export const markNotificationsRead = (
  ids: number[]
): Promise<{ unread: number }> => {
  return request<{ unread: number }>('/notifications/read', {
    method: 'POST',
    body: { ids },
  });
};

// The session's own switch; nobody reads or sets another Account's.
export const getNotificationSettings = (): Promise<NotificationSettings> => {
  return request<NotificationSettings>('/notifications/settings');
};

// The server's schema is strict: send exactly the settings object, no extras.
export const updateNotificationSettings = (
  settings: NotificationSettings
): Promise<NotificationSettings> => {
  return request<NotificationSettings>('/notifications/settings', {
    method: 'PATCH',
    body: settings,
  });
};
