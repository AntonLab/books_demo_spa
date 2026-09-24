import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import type { PermissionScope } from '../types/permission.ts';
import {
  assertCoAuthor,
  assertMayChange,
  type CoAuthorTarget,
} from './coAuthorGuard.ts';

const REFUSAL = 'You may only change books you co-author';

const requestAs = (
  userId: number | undefined,
  permissionScope?: PermissionScope
): Request =>
  ({
    user: userId === undefined ? undefined : { id: userId, role: 'author' },
    permissionScope,
  }) as Request;

// Counts lookups, so a test can tell `any` skipped the row entirely.
const bookCreditedTo = (coAuthorIds: number[] | null) => {
  const target = {
    resource: 'Book' as const,
    id: 7,
    lookups: 0,
    coAuthorIds: () => {
      target.lookups += 1;
      return Promise.resolve(coAuthorIds);
    },
  };
  return target satisfies CoAuthorTarget;
};

describe('assertMayChange', () => {
  test('lets a Co-author through under `own`', async () => {
    await assertMayChange(requestAs(1, 'own'), bookCreditedTo([1, 2]), REFUSAL);
  });

  test('refuses an uncredited account with the given message', async () => {
    await assertMayChange(
      requestAs(3, 'own'),
      bookCreditedTo([1, 2]),
      REFUSAL
    ).then(
      () => assert.fail('expected a refusal'),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError);
        assert.equal(error.message, REFUSAL);
      }
    );
  });

  test('skips the lookup under `any`, even for a missing row', async () => {
    const target = bookCreditedTo(null);
    await assertMayChange(requestAs(3, 'any'), target, REFUSAL);
    assert.equal(target.lookups, 0);
  });

  test('fails closed when no scope was stamped', async () => {
    await assert.rejects(
      assertMayChange(requestAs(3), bookCreditedTo([1]), REFUSAL),
      ForbiddenError
    );
  });

  test('answers 404 before 403, naming the resource', async () => {
    await assertMayChange(
      requestAs(3, 'own'),
      bookCreditedTo(null),
      REFUSAL
    ).then(
      () => assert.fail('expected a 404'),
      (error: unknown) => {
        assert.ok(error instanceof NotFoundError);
        assert.match(error.message, /Book/);
      }
    );
  });

  test('refuses a request with no account', async () => {
    await assert.rejects(
      assertMayChange(
        requestAs(undefined, 'own'),
        bookCreditedTo([1]),
        REFUSAL
      ),
      ForbiddenError
    );
  });
});

describe('assertCoAuthor', () => {
  test('holds a Moderator under `any` to the byline rule', async () => {
    const target = bookCreditedTo([1]);
    await assert.rejects(
      assertCoAuthor(requestAs(3, 'any'), target, REFUSAL),
      ForbiddenError
    );
    assert.equal(target.lookups, 1);
  });

  test('lets a Co-author through whatever the scope', async () => {
    await assertCoAuthor(requestAs(1, 'any'), bookCreditedTo([1]), REFUSAL);
  });
});
