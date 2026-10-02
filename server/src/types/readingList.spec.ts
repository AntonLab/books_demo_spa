import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addReadingListItemSchema,
  createReadingListSchema,
  listReadingListsQuerySchema,
  myReadingListsQuerySchema,
  reorderReadingListItemsSchema,
  updateReadingListSchema,
} from './readingList.ts';

describe('reading list schemas', () => {
  test('create takes a title alone: description and tags default', () => {
    assert.deepEqual(
      createReadingListSchema.parse({ title: ' Cold nights ' }),
      {
        title: 'Cold nights',
        description: '',
        tags: [],
      }
    );
  });

  test('create refuses a blank, an over-long or a missing title', () => {
    assert.equal(
      createReadingListSchema.safeParse({ title: '   ' }).success,
      false
    );
    assert.equal(
      createReadingListSchema.safeParse({ title: 'a'.repeat(201) }).success,
      false
    );
    assert.equal(createReadingListSchema.safeParse({}).success, false);
    assert.equal(
      createReadingListSchema.safeParse({ title: 'a'.repeat(200) }).success,
      true
    );
  });

  test('description is capped at the Series limit, tags dedupe and cap at 20', () => {
    assert.equal(
      createReadingListSchema.safeParse({
        title: 'x',
        description: 'd'.repeat(5001),
      }).success,
      false
    );
    assert.deepEqual(
      createReadingListSchema.parse({ title: 'x', tags: ['a', 'a', 'b'] }).tags,
      ['a', 'b']
    );
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`);
    assert.equal(
      createReadingListSchema.safeParse({ title: 'x', tags: many }).success,
      false
    );
  });

  test('update keeps absent fields absent and refuses an empty body', () => {
    assert.deepEqual(updateReadingListSchema.parse({ title: 'New' }), {
      title: 'New',
    });
    assert.equal(updateReadingListSchema.safeParse({}).success, false);
    assert.equal(
      updateReadingListSchema.safeParse({ title: '' }).success,
      false
    );
  });

  test('addItem takes exactly one of bookId and seriesId', () => {
    assert.deepEqual(addReadingListItemSchema.parse({ bookId: 4 }), {
      bookId: 4,
      seriesId: null,
    });
    assert.deepEqual(addReadingListItemSchema.parse({ seriesId: '5' }), {
      bookId: null,
      seriesId: 5,
    });
    assert.equal(addReadingListItemSchema.safeParse({}).success, false);
    assert.equal(
      addReadingListItemSchema.safeParse({ bookId: 1, seriesId: 2 }).success,
      false
    );
  });

  test('reorder needs 1..100 distinct ids', () => {
    assert.deepEqual(
      reorderReadingListItemsSchema.parse({ itemIds: [3, 1, 2] }),
      { itemIds: [3, 1, 2] }
    );
    assert.equal(
      reorderReadingListItemsSchema.safeParse({ itemIds: [] }).success,
      false
    );
    assert.equal(
      reorderReadingListItemsSchema.safeParse({ itemIds: [1, 1] }).success,
      false
    );
    const tooMany = Array.from({ length: 101 }, (_, i) => i + 1);
    assert.equal(
      reorderReadingListItemsSchema.safeParse({ itemIds: tooMany }).success,
      false
    );
  });

  test('list query needs userId and defaults the page', () => {
    assert.deepEqual(listReadingListsQuerySchema.parse({ userId: '7' }), {
      userId: 7,
      current: 1,
      pageSize: 20,
    });
    assert.equal(listReadingListsQuerySchema.safeParse({}).success, false);
    assert.equal(
      listReadingListsQuerySchema.safeParse({ userId: '7', pageSize: '101' })
        .success,
      false
    );
  });

  test('my-lists query takes a bookId, a seriesId or neither, never both', () => {
    assert.deepEqual(myReadingListsQuerySchema.parse({ bookId: '3' }), {
      bookId: 3,
    });
    assert.deepEqual(myReadingListsQuerySchema.parse({}), {});
    assert.equal(
      myReadingListsQuerySchema.safeParse({ bookId: '3', seriesId: '4' })
        .success,
      false
    );
  });
});
