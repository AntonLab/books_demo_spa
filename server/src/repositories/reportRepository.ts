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

  // take, uphold and dismiss act on every Report of the Comment in the state
  // the action needs. Errors in this order: NotFoundError('Comment', id);
  // ForbiddenError when `moderator` owns the Comment; StateConflictError (409)
  // when no Report is in that state (take: 'new'; uphold, dismiss:
  // 'in_review'). Settled Reports are never touched. Each records
  // `moderator` (whoever acts last). `take` moves 'new' to 'in_review' and
  // sets takenAt. `uphold` moves 'in_review' to 'upheld', sets settledAt and
  // the Comment's tombstone to 'removed' only where it is null. `dismiss`
  // moves 'in_review' to 'dismissed', sets settledAt and stores the Comment's
  // current text in settledText.
  take(commentId: number, moderator: Account): Promise<void>;
  uphold(commentId: number, moderator: Account): Promise<void>;
  dismiss(commentId: number, moderator: Account): Promise<void>;
}
