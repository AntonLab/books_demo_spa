import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commentIdParamSchema,
  createReportSchema,
  listReportsQuerySchema,
  reportRangeSchema,
} from './report.ts';

const RANGE = { from: '2026-03-01T00:00:00Z', to: '2026-03-02T00:00:00Z' };

describe('report schemas', () => {
  test('a reason without an explanation parses to a null explanation', () => {
    assert.deepEqual(createReportSchema.parse({ reason: 'spam' }), {
      reason: 'spam',
      explanation: null,
    });
    assert.deepEqual(
      createReportSchema.parse({ reason: 'spoilers', explanation: '  ' }),
      {
        reason: 'spoilers',
        explanation: null,
      }
    );
  });

  test('only Other takes an explanation, and it requires one of 1..500 characters', () => {
    assert.equal(
      createReportSchema.safeParse({ reason: 'harassment', explanation: 'x' })
        .success,
      false
    );
    assert.equal(
      createReportSchema.safeParse({ reason: 'other' }).success,
      false
    );
    assert.equal(
      createReportSchema.safeParse({ reason: 'other', explanation: '   ' })
        .success,
      false
    );
    assert.deepEqual(
      createReportSchema.parse({ reason: 'other', explanation: ' rude ' }),
      {
        reason: 'other',
        explanation: 'rude',
      }
    );
    assert.equal(
      createReportSchema.safeParse({
        reason: 'other',
        explanation: 'a'.repeat(500),
      }).success,
      true
    );
    assert.equal(
      createReportSchema.safeParse({
        reason: 'other',
        explanation: 'a'.repeat(501),
      }).success,
      false
    );
    assert.equal(
      createReportSchema.safeParse({ reason: 'bribery' }).success,
      false
    );
  });

  test('the range coerces to dates and must be non-empty and in order', () => {
    const parsed = reportRangeSchema.parse(RANGE);
    assert.equal(parsed.from.toISOString(), '2026-03-01T00:00:00.000Z');
    assert.equal(
      reportRangeSchema.safeParse({ from: RANGE.to, to: RANGE.from }).success,
      false
    );
    assert.equal(
      reportRangeSchema.safeParse({ from: RANGE.from, to: RANGE.from }).success,
      false
    );
    assert.equal(
      reportRangeSchema.safeParse({ from: RANGE.from }).success,
      false
    );
    assert.equal(
      reportRangeSchema.safeParse({ from: 'x', to: RANGE.to }).success,
      false
    );
  });

  test('the list query defaults its page and takes an optional status', () => {
    const parsed = listReportsQuerySchema.parse(RANGE);
    assert.deepEqual(
      [parsed.limit, parsed.offset, parsed.status],
      [20, 0, undefined]
    );
    assert.equal(
      listReportsQuerySchema.parse({ ...RANGE, status: 'in_review' }).status,
      'in_review'
    );
    assert.equal(
      listReportsQuerySchema.safeParse({ ...RANGE, status: 'open' }).success,
      false
    );
    assert.equal(
      listReportsQuerySchema.safeParse({ ...RANGE, limit: '101' }).success,
      false
    );
  });

  test('the comment id param is a positive integer', () => {
    assert.deepEqual(commentIdParamSchema.parse({ commentId: '4' }), {
      commentId: 4,
    });
    assert.equal(
      commentIdParamSchema.safeParse({ commentId: '0' }).success,
      false
    );
  });
});
