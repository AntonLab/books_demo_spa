import type { Dayjs } from 'dayjs';
import type { ReportRange } from '@/api/reports';

// `to` is the start of the day after the last one, because the server's `to`
// is exclusive. `add(1, 'day')` rather than 24 hours: a DST day is 23 or 25.
export const dayRange = (start: Dayjs, end: Dayjs): ReportRange => ({
  from: start.startOf('day').toISOString(),
  to: end.add(1, 'day').startOf('day').toISOString(),
});
