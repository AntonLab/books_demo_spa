import {
  BAN_MARK_THRESHOLD,
  OPEN_REPORT_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TOP_ACCOUNTS,
  type ReportReason,
  type ReportRow,
  type ReportStatistics,
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
import type {
  CreateReportInput,
  ListReportsQuery,
  ReportRange,
} from '../types/report.ts';
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
  const { accounts, comments, rows } = options;
  const act = (
    commentId: number,
    moderator: Account,
    needed: ReportStatus,
    apply: (row: FakeReport, comment: FakeComment) => void
  ) => {
    const comment = comments.get(commentId);
    if (!comment) throw new NotFoundError('Comment', commentId);
    if (comment.userId === moderator.id) throw new ForbiddenError();
    const matching = rows.filter(
      (row) => row.commentId === commentId && row.status === needed
    );
    if (!matching.length) {
      throw new StateConflictError(`Comment has no ${needed} report`);
    }
    for (const row of matching) {
      row.moderatorId = moderator.id;
      apply(row, comment);
    }
  };
  return {
    async take(commentId: number, moderator: Account) {
      act(commentId, moderator, 'new', (row) => {
        row.status = 'in_review';
        row.takenAt = new Date();
      });
    },
    async uphold(commentId: number, moderator: Account) {
      act(commentId, moderator, 'in_review', (row, comment) => {
        row.status = 'upheld';
        row.settledAt = new Date();
        comment.tombstone ??= 'removed';
      });
    },
    async dismiss(commentId: number, moderator: Account) {
      act(commentId, moderator, 'in_review', (row, comment) => {
        row.status = 'dismissed';
        row.settledAt = new Date();
        row.settledText = comment.text;
      });
    },
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
    async list(query: ListReportsQuery, viewer: Account) {
      const matches = rows
        .filter(
          (row) =>
            row.createdAt >= query.from &&
            row.createdAt < query.to &&
            (!query.status || row.status === query.status)
        )
        .sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id
        );
      const bannedMarks = (accountId: number) =>
        new Set(
          rows
            .filter(
              (row) =>
                row.status === 'upheld' && row.reportedAccountId === accountId
            )
            .map((row) => row.commentId)
        ).size;
      const items = matches
        .slice(query.offset, query.offset + query.limit)
        .map((row): ReportRow => {
          const reporter =
            row.reporterId === null ? undefined : accounts.get(row.reporterId);
          const reported =
            row.reportedAccountId === null
              ? undefined
              : accounts.get(row.reportedAccountId);
          const comment = comments.get(row.commentId);
          return {
            id: row.id,
            createdAt: row.createdAt,
            reporter:
              reporter && row.reporterId !== null
                ? { id: row.reporterId, login: reporter.login }
                : null,
            isSystem: row.isSystem,
            reason: row.reason,
            explanation: row.explanation,
            reportedAccount:
              reported && row.reportedAccountId !== null
                ? {
                    id: row.reportedAccountId,
                    login: reported.login,
                    status: reported.status,
                    role: reported.role,
                    atBanThreshold:
                      bannedMarks(row.reportedAccountId) >= BAN_MARK_THRESHOLD,
                  }
                : null,
            comment: {
              id: row.commentId,
              bookId: comment?.bookId ?? 0,
              text: comment?.tombstone ? '' : (comment?.text ?? ''),
              tombstone: comment?.tombstone ?? null,
            },
            status: row.status,
            moderatorId:
              row.moderatorId !== null && accounts.has(row.moderatorId)
                ? row.moderatorId
                : null,
            moderatorLogin:
              (row.moderatorId !== null &&
                accounts.get(row.moderatorId)?.login) ||
              null,
            isOwnComment: comment?.userId === viewer.id,
          };
        });
      return { items, total: matches.length };
    },
    async statistics({ from, to }: ReportRange) {
      const inRange = (date: Date | null) =>
        date !== null && date >= from && date < to;
      const created = rows.filter((row) => inRange(row.createdAt));
      const byStatus = Object.fromEntries(
        REPORT_STATUSES.map((status) => [status, 0])
      ) as ReportStatistics['byStatus'];
      const byReason = Object.fromEntries(
        REPORT_REASONS.map((reason) => [reason, 0])
      ) as ReportStatistics['byReason'];
      const perAccount = new Map<number, number>();
      for (const row of created) {
        byStatus[row.status] += 1;
        byReason[row.reason] += 1;
        if (row.reportedAccountId !== null) {
          perAccount.set(
            row.reportedAccountId,
            (perAccount.get(row.reportedAccountId) ?? 0) + 1
          );
        }
      }
      const topAccounts = [...perAccount]
        .sort(([idA, a], [idB, b]) => b - a || idA - idB)
        .slice(0, REPORT_TOP_ACCOUNTS)
        .map(([id, count]) => ({
          id,
          login: accounts.get(id)?.login ?? '',
          count,
        }));
      const settled = rows.filter((row) => inRange(row.settledAt));
      const averageSettleSeconds = settled.length
        ? settled.reduce(
            (sum, row) =>
              sum + (row.settledAt!.getTime() - row.createdAt.getTime()) / 1000,
            0
          ) / settled.length
        : null;
      return { byStatus, byReason, topAccounts, averageSettleSeconds };
    },
  };
}
