import {
  OPEN_REPORT_STATUSES,
  type ReportReason,
  type ReportStatus,
  type Tombstone,
  type UserRole,
  type UserStatus,
} from 'shared';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { CreateReportInput } from '../types/report.ts';
import type { Account, ReportRepository } from './reportRepository.ts';

export interface FakeAccount {
  login: string;
  status: UserStatus;
  role: UserRole;
}

export interface FakeComment {
  id: number;
  userId: number | null;
  bookId: number;
  text: string;
  tombstone: Tombstone | null;
}

export interface FakeReport {
  id: number;
  commentId: number;
  reporterId: number | null;
  isSystem: boolean;
  reportedAccountId: number | null;
  reason: ReportReason;
  explanation: string | null;
  status: ReportStatus;
  moderatorId: number | null;
  settledText: string | null;
  takenAt: Date | null;
  settledAt: Date | null;
  createdAt: Date;
}

// An in-memory ReportRepository for the route specs, held to the real one by
// reportRepository.contract.testkit.ts. The maps and `rows` are the tables.
export function createFakeReportRepository(options: {
  accounts: Map<number, FakeAccount>;
  comments: Map<number, FakeComment>;
  rows: FakeReport[];
}): ReportRepository {
  const { comments, rows } = options;
  return {
    async create(
      commentId: number,
      input: CreateReportInput,
      reporter: Account
    ) {
      const comment = comments.get(commentId);
      if (!comment) throw new NotFoundError('Comment', commentId);
      if (comment.userId === reporter.id) throw new ForbiddenError();
      if (comment.tombstone)
        throw new BadRequestError('Comment cannot be reported');
      const ofComment = rows.filter((row) => row.commentId === commentId);
      const isOpen = ofComment.some((row) =>
        (OPEN_REPORT_STATUSES as readonly ReportStatus[]).includes(row.status)
      );
      if (isOpen || ofComment.some((row) => row.reporterId === reporter.id)) {
        throw new StateConflictError('Comment is already reported');
      }
      const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
      rows.push({
        id,
        commentId,
        reporterId: reporter.id,
        isSystem: false,
        reportedAccountId: comment.userId,
        reason: input.reason,
        explanation: input.explanation ?? null,
        status: 'new',
        moderatorId: null,
        settledText: null,
        takenAt: null,
        settledAt: null,
        createdAt: new Date(),
      });
      return { id };
    },
  };
}
