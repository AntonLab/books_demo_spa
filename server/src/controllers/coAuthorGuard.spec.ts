import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { USER_ROLES, type UserRole } from 'shared';
import { buildMatrixRows } from '../permissions/matrix.ts';
import { loadMatrix } from '../permissions/permissionStore.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';
import type { PermissionScope } from '../types/permission.ts';
import {
  assertCoAuthor,
  assertMayChange,
  assertMayRemoveCredit,
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

// Counts lookups, so a test can tell whether the row was resolved.
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

  test('answers 404 under `any` for a missing row', async () => {
    const target = bookCreditedTo(null);
    await assert.rejects(
      assertMayChange(requestAs(3, 'any'), target, REFUSAL),
      NotFoundError
    );
    assert.equal(target.lookups, 1);
  });

  test('lets `any` through a row it is not credited on, after one lookup', async () => {
    const target = bookCreditedTo([1]);
    await assertMayChange(requestAs(3, 'any'), target, REFUSAL);
    assert.equal(target.lookups, 1);
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

// Removing a credit sits behind requireAuth alone, so no scope is stamped and
// the guard reads the matrix for the caller's Role itself.
const signedInAs = (userId: number, role: UserRole): Request =>
  ({ user: { id: userId, role } }) as Request;

const ONLY_A_CO_AUTHOR = 'Only a co-author may remove a co-author';

describe('assertMayRemoveCredit', () => {
  test('refuses a request with no account before any lookup', async () => {
    const target = bookCreditedTo([1]);
    await assert.rejects(
      assertMayRemoveCredit(requestAs(undefined), target, 'books', 1, REFUSAL),
      UnauthorizedError
    );
    assert.equal(target.lookups, 0);
  });

  // `user` is the Co-author who switched Role and holds `none` on books.
  // A missing work or an uncredited account is the repository's 404, the last
  // Co-author its 409, so the guard looks nothing up.
  for (const role of USER_ROLES) {
    test(`lets a ${role} leave without a lookup`, async () => {
      const target = bookCreditedTo(null);
      await assertMayRemoveCredit(
        signedInAs(1, role),
        target,
        'books',
        1,
        REFUSAL
      );
      assert.equal(target.lookups, 0);
    });
  }

  // 403 before any lookup, as today: `none` is no longer an author and `any`
  // is a Moderator, who never changes a byline — credited or not.
  for (const [role, scope] of [
    ['user', 'none'],
    ['admin', 'any'],
    ['superadmin', 'any'],
  ] as const) {
    test(`refuses a ${role} (\`${scope}\`) removing someone else, before any lookup`, async () => {
      const target = bookCreditedTo([1, 2]);
      await assertMayRemoveCredit(
        signedInAs(1, role),
        target,
        'books',
        2,
        REFUSAL
      ).then(
        () => assert.fail('expected a refusal'),
        (error: unknown) => {
          assert.ok(error instanceof ForbiddenError);
          assert.equal(error.message, ONLY_A_CO_AUTHOR);
        }
      );
      assert.equal(target.lookups, 0);
    });
  }

  test('lets a Co-author holding `own` remove another', async () => {
    const target = bookCreditedTo([1, 2]);
    await assertMayRemoveCredit(
      signedInAs(1, 'author'),
      target,
      'books',
      2,
      REFUSAL
    );
    assert.equal(target.lookups, 1);
  });

  test('refuses an uncredited author with the given refusal', async () => {
    await assertMayRemoveCredit(
      signedInAs(3, 'author'),
      bookCreditedTo([1, 2]),
      'books',
      1,
      REFUSAL
    ).then(
      () => assert.fail('expected a refusal'),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError);
        assert.equal(error.message, REFUSAL);
      }
    );
  });

  test('answers 404 for a missing work before refusing an author', async () => {
    await assert.rejects(
      assertMayRemoveCredit(
        signedInAs(3, 'author'),
        bookCreditedTo(null),
        'books',
        1,
        REFUSAL
      ),
      NotFoundError
    );
  });

  test('reads the matrix for the module it is given', async (t) => {
    loadMatrix(
      buildMatrixRows().map((row) =>
        row.role === 'author' &&
        row.module === 'series' &&
        row.action === 'update'
          ? { ...row, scope: 'none' as const }
          : row
      )
    );
    t.after(() => loadMatrix(buildMatrixRows()));

    await assert.rejects(
      assertMayRemoveCredit(
        signedInAs(1, 'author'),
        bookCreditedTo([1, 2]),
        'series',
        2,
        REFUSAL
      ),
      ForbiddenError
    );
    await assertMayRemoveCredit(
      signedInAs(1, 'author'),
      bookCreditedTo([1, 2]),
      'books',
      2,
      REFUSAL
    );
  });
});
