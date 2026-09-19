// The one way the client writes a date. The locale is fixed to `en`, because
// the UI is English and the browser's locale would give it a second language;
// the time zone stays the browser's, so a moment reads as the visitor's own
// local time. Each formatter is built once: constructing an
// Intl.DateTimeFormat is the expensive part, and every list row would
// otherwise pay it.
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Dates cross the wire as ISO strings (Wire<T>), so both take one.
const formatIso =
  (format: Intl.DateTimeFormat) =>
  (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : format.format(date);
  };

export const formatDate = formatIso(dateFormat);

export const formatDateTime = formatIso(dateTimeFormat);
