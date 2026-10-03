import type { Viewer } from './visibility.ts';
import type { ReportRow } from 'shared';
import type { CreateReportInput, ListReportsQuery } from '../types/report.ts';

// The signed-in account behind a Report. Never a Guest: every route that
// reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

export interface ReportRepository {
  // Errors in this order: NotFoundError('Comment', id); ForbiddenError for the
  // reporter's own Comment; BadRequestError for a Tombstone; StateConflictError
  // (409) when the Comment has an Open report, and the same when the reporter
  // already reported it. The reported Account stored is the Comment's Owner;
  // the status starts 'new'.
  create(
    commentId: number,
    input: CreateReportInput,
    reporter: Account
  ): Promise<{ id: number }>;

  // Reports created in [from, to), newest first (ties by id descending),
  // optionally of one status. `total` counts every match, not the page.
  // `reporter` is null for a System report and a deleted reporter;
  // `reportedAccount` is null once that Account is deleted. `atBanThreshold`:
  // the Account owns at least BAN_MARK_THRESHOLD distinct Comments with an
  // Upheld report (a restored Comment still counts).
  list(
    query: ListReportsQuery,
    viewer: Account
  ): Promise<{ items: ReportRow[]; total: number }>;
}
