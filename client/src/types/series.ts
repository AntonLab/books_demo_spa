import type * as Shared from 'shared';
import type { Wire } from 'shared';

// Like a book, a series has no userId: its Co-authors come embedded, in credit
// order.
export type PublicSeries = Wire<Shared.PublicSeries>;

// One book of the series editor's list. A summary, because the list reaches a
// series' Co-authors who may not co-author a Draft book filed in it: what the
// book is called and where it stands, never what it says.
export type SeriesBookSummary = Wire<Shared.SeriesBookSummary>;
