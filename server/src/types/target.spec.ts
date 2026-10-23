import test from 'node:test';
import assert from 'node:assert/strict';
import { exactlyOneSet } from './target.ts';

test('is true when exactly one side is set', () => {
  assert.equal(exactlyOneSet(1, null), true);
  assert.equal(exactlyOneSet(null, 2), true);
  assert.equal(exactlyOneSet(undefined, 2), true);
});

test('is false when both or neither are set', () => {
  assert.equal(exactlyOneSet(null, null), false);
  assert.equal(exactlyOneSet(undefined, null), false);
  assert.equal(exactlyOneSet(1, 2), false);
});

test('counts 0 as set', () => {
  assert.equal(exactlyOneSet(0, null), true);
  assert.equal(exactlyOneSet(0, 0), false);
});
