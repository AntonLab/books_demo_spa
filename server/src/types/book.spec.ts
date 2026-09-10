import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookSchema, updateBookSchema } from './book.ts';

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
