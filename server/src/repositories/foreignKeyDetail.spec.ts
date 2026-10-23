import test from 'node:test';
import assert from 'node:assert/strict';
import { ForeignKeyConstraintError } from 'sequelize';
import { foreignKeyDetail } from './foreignKeyDetail.ts';

test('joins the index and the parent message of a foreign key error', () => {
  const error = new ForeignKeyConstraintError({
    index: 'comments_ibfk_1',
    parent: new Error('Cannot add: bookId') as never,
  });
  assert.equal(foreignKeyDetail(error), 'comments_ibfk_1 Cannot add: bookId');
});

test('falls back to the error message when there is no parent message', () => {
  const error = new ForeignKeyConstraintError({ message: 'boom' });
  // The constructor fills parent with an empty message; a driver error may carry none.
  Object.assign(error.parent, { message: undefined });
  assert.equal(foreignKeyDetail(error), ' boom');
});

test('returns null for any other error or value', () => {
  assert.equal(foreignKeyDetail(new Error('x')), null);
  assert.equal(foreignKeyDetail('x'), null);
  assert.equal(foreignKeyDetail(null), null);
});
