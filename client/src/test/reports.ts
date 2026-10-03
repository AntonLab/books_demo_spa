import type { ReportRow, ReportStatistics } from '../types/api';

export const reportRow = (overrides: Partial<ReportRow> = {}): ReportRow => ({
  id: 1,
  createdAt: '2026-10-03T10:00:00.000Z',
  reporter: { id: 2, login: 'Reader' },
  isSystem: false,
  reason: 'spam',
  explanation: null,
  reportedAccount: {
    id: 3,
    login: 'Writer',
    status: 'active',
    role: 'user',
    atBanThreshold: false,
  },
  comment: { id: 5, bookId: 1, text: 'Buy now', tombstone: null },
  status: 'new',
  moderatorLogin: null,
  isOwnComment: false,
  ...overrides,
});

export const emptyStatistics = (): ReportStatistics => ({
  byStatus: { new: 0, in_review: 0, upheld: 0, dismissed: 0 },
  byReason: { spam: 0, harassment: 0, spoilers: 0, other: 0 },
  topAccounts: [],
  averageSettleSeconds: null,
});
