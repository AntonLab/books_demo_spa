import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENRE_NAME_MAX_LENGTH,
  genreBodySchema,
  idParamSchema,
} from './genre.ts';

test('a name is trimmed before it is stored or compared', () => {
  assert.equal(genreBodySchema.parse({ name: '  Gothic  ' }).name, 'Gothic');
});

test('a blank or whitespace-only name is refused', () => {
  assert.equal(genreBodySchema.safeParse({ name: '' }).success, false);
  assert.equal(genreBodySchema.safeParse({ name: '   ' }).success, false);
  assert.equal(genreBodySchema.safeParse({}).success, false);
});

test('a name is refused past 50 characters, counted after trimming', () => {
  const longest = 'g'.repeat(GENRE_NAME_MAX_LENGTH);

  assert.equal(genreBodySchema.parse({ name: longest }).name, longest);
  assert.equal(genreBodySchema.parse({ name: ` ${longest} ` }).name, longest);
  assert.equal(
    genreBodySchema.safeParse({ name: `${longest}h` }).success,
    false
  );
});

test('the name is the only field a body may carry', () => {
  assert.deepEqual(genreBodySchema.parse({ name: 'Gothic', id: 7 }), {
    name: 'Gothic',
  });
});

test('the id param is coerced from the string a path segment always is', () => {
  assert.deepEqual(idParamSchema.parse({ id: '12' }), { id: 12 });
  assert.equal(idParamSchema.safeParse({ id: '0' }).success, false);
  assert.equal(idParamSchema.safeParse({ id: 'abc' }).success, false);
});
