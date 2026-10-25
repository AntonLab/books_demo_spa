import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRedirected } from '../layout-lint-rules.mjs';

test('the same path is not a redirect', () => {
  assert.equal(isRedirected('books/17', '/books/17'), false);
});

test('a trailing slash on either side is not a redirect', () => {
  assert.equal(isRedirected('books/17/', '/books/17'), false);
  assert.equal(isRedirected('books/17', '/books/17/'), false);
});

test('a query in the requested path is not a redirect', () => {
  assert.equal(isRedirected('books/17?edit=1', '/books/17'), false);
});

test('a hash in the requested path is not a redirect', () => {
  assert.equal(isRedirected('books/17#reviews', '/books/17'), false);
});

test('query, hash and trailing slash together are not a redirect', () => {
  assert.equal(isRedirected('books/17/?a=1#b', '/books/17'), false);
});

test('a different final path is a redirect', () => {
  assert.equal(isRedirected('profile/my-books', '/'), true);
});
