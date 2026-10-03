import { z } from 'zod';
import {
  REPORT_EXPLANATION_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_STATUSES,
} from 'shared';
import { limitOffsetShape } from './pagination.ts';
import { idSchema } from './params.ts';

// Only Other takes an explanation, and it must have one; the transform gives
// every other reason the same empty value, null.
export const createReportSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    explanation: z.string().trim().optional(),
  })
  .superRefine(({ reason, explanation }, ctx) => {
    if (reason === 'other') {
      if (!explanation) {
        ctx.addIssue({
          code: 'custom',
          path: ['explanation'],
          message: 'An explanation is required for Other',
        });
      } else if (explanation.length > REPORT_EXPLANATION_MAX_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: ['explanation'],
          message: `At most ${REPORT_EXPLANATION_MAX_LENGTH} characters`,
        });
      }
    } else if (explanation) {
      ctx.addIssue({
        code: 'custom',
        path: ['explanation'],
        message: 'Only Other takes an explanation',
      });
    }
  })
  .transform(({ reason, explanation }) => ({
    reason,
    explanation: explanation || null,
  }));

// [from, to): an empty or inverted range is a 400, not an empty result.
export const reportRangeSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine(({ from, to }) => from < to, { message: 'from must be before to' });

export const listReportsQuerySchema = reportRangeSchema.and(
  z.object({
    status: z.enum(REPORT_STATUSES).optional(),
    ...limitOffsetShape,
  })
);

export const commentIdParamSchema = z.object({ commentId: idSchema });

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportRange = z.infer<typeof reportRangeSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
