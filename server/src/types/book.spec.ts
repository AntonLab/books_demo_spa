import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from './book.ts';

test('createBookSchema requires a title', () => {
  const result = createBookSchema.safeParse({
    userId: 1,
    description: 'A tale',
  });
  assert.equal(result.success, false);
});

test('createBookSchema trims the title', () => {
  const result = createBookSchema.parse({
    userId: 1,
    title: '  Dragons  ',
    description: 'A tale',
  });
  assert.equal(result.title, 'Dragons');
});

test('createBookSchema rejects a whitespace-only title', () => {
  const result = createBookSchema.safeParse({
    userId: 1,
    title: '   ',
    description: 'A tale',
  });
  assert.equal(result.success, false);
});

test('updateBookSchema accepts a title alone', () => {
  const result = updateBookSchema.parse({ title: 'Dragons' });
  assert.deepEqual(result, { title: 'Dragons' });
});

test('createBookSchema leaves genreId out entirely when it is absent', () => {
  const result = createBookSchema.parse({
    title: 'Dragons',
    description: 'A tale',
  });

  assert.equal('genreId' in result, false);
});

test('createBookSchema takes a genreId, coerced, or an explicit null', () => {
  assert.equal(
    createBookSchema.parse({ title: 'D', description: 'A', genreId: '4' })
      .genreId,
    4
  );
  assert.equal(
    createBookSchema.parse({ title: 'D', description: 'A', genreId: null })
      .genreId,
    null
  );
  assert.equal(
    createBookSchema.safeParse({ title: 'D', description: 'A', genreId: 0 })
      .success,
    false
  );
});

// A6: .partial() must not turn an absent key into null, or a PATCH that only
// renames a book would clear its Genre.
test('updateBookSchema keeps an absent genreId absent and an explicit null null', () => {
  assert.deepEqual(updateBookSchema.parse({ title: 'Dragons' }), {
    title: 'Dragons',
  });
  assert.deepEqual(updateBookSchema.parse({ genreId: null }), {
    genreId: null,
  });
  assert.deepEqual(updateBookSchema.parse({ genreId: '4' }), { genreId: 4 });
});

test('listBooksQuerySchema takes genreId as a filter', () => {
  assert.equal(listBooksQuerySchema.parse({ genreId: '4' }).genreId, 4);
  assert.equal(listBooksQuerySchema.parse({}).genreId, undefined);
});

test('listBooksQuerySchema pages by current and pageSize, defaulting to page 1 of 20', () => {
  const parsed = listBooksQuerySchema.parse({});
  assert.equal(parsed.current, 1);
  assert.equal(parsed.pageSize, 20);
  assert.deepEqual(
    (({ current, pageSize }) => ({ current, pageSize }))(
      listBooksQuerySchema.parse({ current: '3', pageSize: '100' })
    ),
    { current: 3, pageSize: 100 }
  );
  for (const bad of [
    { current: '0' },
    { current: '1.5' },
    { pageSize: '0' },
    { pageSize: '101' },
  ]) {
    assert.equal(listBooksQuerySchema.safeParse(bad).success, false);
  }
});
