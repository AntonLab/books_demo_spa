import type { Viewer } from './visibility.ts';
import type { CreateReportInput } from '../types/report.ts';

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
}
