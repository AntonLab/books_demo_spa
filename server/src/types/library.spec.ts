import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryParamSchema, listLibraryQuerySchema } from './library.ts';

describe('library schemas', () => {
  test('listLibraryQuerySchema defaults to page 1 of 20 with no status', () => {
    assert.deepEqual(listLibraryQuerySchema.parse({}), {
      current: 1,
      pageSize: 20,
    });
  });

  test('listLibraryQuerySchema coerces numbers and bounds them', () => {
    assert.deepEqual(
      listLibraryQuerySchema.parse({
        status: 'read',
        current: '3',
        pageSize: '50',
      }),
      { status: 'read', current: 3, pageSize: 50 }
    );
    assert.equal(
      listLibraryQuerySchema.safeParse({ current: '0' }).success,
      false
    );
    assert.equal(
      listLibraryQuerySchema.safeParse({ pageSize: '101' }).success,
      false
    );
    assert.equal(
      listLibraryQuerySchema.safeParse({ status: 'owned' }).success,
      false
    );
  });

  test('libraryParamSchema takes a positive integer bookId', () => {
    assert.deepEqual(libraryParamSchema.parse({ bookId: '7' }), { bookId: 7 });
    assert.equal(libraryParamSchema.safeParse({ bookId: 'x' }).success, false);
  });
});
