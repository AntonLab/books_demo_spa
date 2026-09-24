import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENRE_NAME_MAX_LENGTH,
  genreBodySchema,
  listGenresQuerySchema,
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

test('listGenresQuerySchema reads nonEmpty as a real boolean', () => {
  assert.equal(
    listGenresQuerySchema.parse({ nonEmpty: 'true' }).nonEmpty,
    true
  );
  assert.equal(
    listGenresQuerySchema.parse({ nonEmpty: 'false' }).nonEmpty,
    false
  );
  assert.equal(listGenresQuerySchema.parse({}).nonEmpty, undefined);
  assert.equal(
    listGenresQuerySchema.safeParse({ nonEmpty: 'maybe' }).success,
    false
  );
});
