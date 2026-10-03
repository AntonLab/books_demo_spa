import type { ReportReason, ReportStatus } from 'shared';

// Typed Record so a new reason or status fails the build until it is labelled.
export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  spoilers: 'Spoilers',
  other: 'Other',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  new: 'New',
  in_review: 'In review',
  upheld: 'Upheld',
  dismissed: 'Dismissed',
};
