import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshtein,
  normaliseCommentText,
  shouldReopen,
} from './reportText.ts';

describe('normaliseCommentText', () => {
  test('lowers case, strips punctuation and collapses whitespace', () => {
    assert.equal(normaliseCommentText('  Hello,   WORLD!!\n'), 'hello world');
  });
  test('keeps digits and letters of any script', () => {
    assert.equal(normaliseCommentText('Привет, мир! 42'), 'привет мир 42');
  });
});

describe('levenshtein', () => {
  test('counts single-character edits', () => {
    assert.equal(levenshtein('kitten', 'sitting'), 3);
    assert.equal(levenshtein('', 'abc'), 3);
    assert.equal(levenshtein('same', 'same'), 0);
  });
});

describe('shouldReopen', () => {
  const base = 'a'.repeat(100);
  test('case, punctuation and spacing alone never reopen', () => {
    assert.equal(
      shouldReopen('Buy now, friends!', '  buy   NOW friends '),
      false
    );
  });
  test('exactly 15% of the longer text does not reopen, 16% does', () => {
    assert.equal(shouldReopen(base, 'a'.repeat(85) + 'b'.repeat(15)), false);
    assert.equal(shouldReopen(base, 'a'.repeat(84) + 'b'.repeat(16)), true);
  });
  test('two texts that normalise to nothing do not reopen', () => {
    assert.equal(shouldReopen('!!!', '...'), false);
  });
  test('a rewrite of a 10,000-character comment answers true', () => {
    assert.equal(shouldReopen('a'.repeat(10_000), 'b'.repeat(10_000)), true);
    assert.equal(shouldReopen('a'.repeat(10_000), 'a'.repeat(5_000)), true);
  });
});
