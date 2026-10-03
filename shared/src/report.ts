import type { Tombstone } from './comment.ts';
import type { UserRole } from './role.ts';
import type { UserStatus } from './user.ts';

// Report (CONTEXT.md): why an Account reported a Comment.
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'spoilers',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// Report status (CONTEXT.md): where a Report stands.
export const REPORT_STATUSES = [
  'new',
  'in_review',
  'upheld',
  'dismissed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// Report status (CONTEXT.md): the Open statuses, the ones a Moderator still acts on.
export const OPEN_REPORT_STATUSES = ['new', 'in_review'] as const;

// Report (CONTEXT.md): the longest explanation a reporter may give.
export const REPORT_EXPLANATION_MAX_LENGTH = 500;
// Report (CONTEXT.md): a dismissed Comment reopens when an edit changes more
// than this share of the longer text.
export const REOPEN_DISTANCE_RATIO = 0.15;
// Ban mark (CONTEXT.md): the count of marks at which an Account is at the ban threshold.
export const BAN_MARK_THRESHOLD = 10;
// Report statistics (CONTEXT.md): how many most-reported Accounts are listed.
export const REPORT_TOP_ACCOUNTS = 5;

// Report (CONTEXT.md): the POST body.
export interface ReportPayload {
  reason: ReportReason;
  explanation?: string;
}

// Report (CONTEXT.md): the Account whose Comment was reported.
export interface ReportedAccount {
  id: number;
  login: string;
  status: UserStatus;
  role: UserRole;
  atBanThreshold: boolean;
}

// Report (CONTEXT.md): one row of the admin list. `reporter` is null for a
// System report and for a deleted reporter, told apart by `isSystem`;
// `comment.text` is '' on a Tombstone.
export interface ReportRow {
  id: number;
  createdAt: Date;
  reporter: { id: number; login: string } | null;
  isSystem: boolean;
  reason: ReportReason;
  explanation: string | null;
  reportedAccount: ReportedAccount | null;
  comment: {
    id: number;
    bookId: number;
    text: string;
    tombstone: Tombstone | null;
  };
  status: ReportStatus;
  moderatorId: number | null;
  moderatorLogin: string | null;
  isOwnComment: boolean;
}

// Report statistics (CONTEXT.md): counts over a date range.
export interface ReportStatistics {
  byStatus: Record<ReportStatus, number>;
  byReason: Record<ReportReason, number>;
  topAccounts: { id: number; login: string; count: number }[];
  averageSettleSeconds: number | null;
}
