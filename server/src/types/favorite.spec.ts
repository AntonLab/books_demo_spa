import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoriteSchema, listFavoritesQuerySchema } from './favorite.ts';

test('a favorite on a book parses, and the unused target defaults to null', () => {
  assert.deepEqual(createFavoriteSchema.parse({ bookId: 2 }), {
    bookId: 2,
    seriesId: null,
  });
});

test('a favorite on a series parses, and the unused target defaults to null', () => {
  assert.deepEqual(createFavoriteSchema.parse({ seriesId: 3 }), {
    bookId: null,
    seriesId: 3,
  });
});

test('a userId in the body is dropped — the holder comes from the session', () => {
  assert.deepEqual(createFavoriteSchema.parse({ userId: 999, bookId: 2 }), {
    bookId: 2,
    seriesId: null,
  });
});

test('naming both targets is rejected on bookId', () => {
  const result = createFavoriteSchema.safeParse({ bookId: 2, seriesId: 3 });

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ['bookId']);
});

test('naming neither target is rejected', () => {
  assert.throws(() => createFavoriteSchema.parse({}));
});

// The nullable default turns an omitted key into null, so an explicit null
// has to fail the same way an omitted one does.
test('spelling both targets out as null is rejected too', () => {
  assert.throws(() =>
    createFavoriteSchema.parse({ bookId: null, seriesId: null })
  );
});

test('a target id must be a positive integer', () => {
  assert.throws(() => createFavoriteSchema.parse({ bookId: 0 }));
  assert.throws(() => createFavoriteSchema.parse({ seriesId: -1 }));
  assert.throws(() => createFavoriteSchema.parse({ bookId: 1.5 }));
});

test('the list query defaults limit and offset', () => {
  assert.deepEqual(listFavoritesQuerySchema.parse({}), {
    limit: 20,
    offset: 0,
  });
});

test('the list query coerces its numbers and bounds them', () => {
  assert.deepEqual(
    listFavoritesQuerySchema.parse({ limit: '5', offset: '10' }),
    { limit: 5, offset: 10 }
  );
  assert.throws(() => listFavoritesQuerySchema.parse({ limit: '101' }));
  assert.throws(() => listFavoritesQuerySchema.parse({ limit: '0' }));
  assert.throws(() => listFavoritesQuerySchema.parse({ offset: '-1' }));
});
