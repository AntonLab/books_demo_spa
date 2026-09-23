import test from 'node:test';
import assert from 'node:assert/strict';
import { idParamSchema } from './params.ts';

test('the id param is coerced from the string a path segment always is', () => {
  assert.deepEqual(idParamSchema.parse({ id: '12' }), { id: 12 });
  assert.equal(idParamSchema.safeParse({ id: '0' }).success, false);
  assert.equal(idParamSchema.safeParse({ id: 'abc' }).success, false);
});
