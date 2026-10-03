import { LAST_ONLINE_WINDOW_MS } from 'shared';
import { formatDate } from './date';

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Day granularity in the visitor's local time; "yesterday" is built from the
// calendar date, not by subtracting 24 hours, so a DST change cannot skip it.
export const lastOnlineLabel = (
  iso: string | null,
  now: Date = new Date()
): string | null => {
  if (iso === null) return null;
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return null;

  if (now.getTime() - seen.getTime() < LAST_ONLINE_WINDOW_MS)
    return 'Online now';
  if (sameDay(seen, now)) return 'Last online today';
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );
  if (sameDay(seen, yesterday)) return 'Last online yesterday';
  return `Last online ${formatDate(iso)}`;
};
