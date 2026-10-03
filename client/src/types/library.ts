import type * as Shared from 'shared';
import type { ReadingStatus, Wire } from 'shared';

export type LibraryBook = Wire<Shared.LibraryBook>;
export type PublicLibraryEntry = Wire<Shared.PublicLibraryEntry>;
export type LibraryCounts = Shared.LibraryCounts;

// What a reader sees for each Reading status, so every place that shows one
// says the same words.
export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'Reading',
  plan_to_read: 'Plan to read',
  read: 'Read',
  not_interested: 'Not interested',
};

// The Library page's filter: every kept Book, then one status.
export const LIBRARY_FILTERS: readonly {
  value: ReadingStatus | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All in Library' },
  { value: 'reading', label: READING_STATUS_LABELS.reading },
  { value: 'plan_to_read', label: READING_STATUS_LABELS.plan_to_read },
  { value: 'read', label: READING_STATUS_LABELS.read },
  { value: 'not_interested', label: READING_STATUS_LABELS.not_interested },
];
