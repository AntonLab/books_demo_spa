import test from 'node:test';
import assert from 'node:assert/strict';
import { ILLUSTRATION_CAPTION_MAX_LENGTH } from 'shared';
import { updateIllustrationSchema } from './illustration.ts';

test('updateIllustrationSchema keeps a plain caption', () => {
  const result = updateIllustrationSchema.safeParse({ caption: 'text' });

  assert.deepEqual(result.data, { caption: 'text' });
});

test('updateIllustrationSchema trims surrounding whitespace', () => {
  const result = updateIllustrationSchema.safeParse({ caption: '  text  ' });

  assert.deepEqual(result.data, { caption: 'text' });
});

test('updateIllustrationSchema keeps interior whitespace and newlines', () => {
  const result = updateIllustrationSchema.safeParse({ caption: ' a  b\nc ' });

  assert.deepEqual(result.data, { caption: 'a  b\nc' });
});

test('updateIllustrationSchema turns a blank caption into null', () => {
  for (const caption of ['', '   ', ' \t\n ']) {
    const result = updateIllustrationSchema.safeParse({ caption });

    assert.deepEqual(result.data, { caption: null });
  }
});

test('updateIllustrationSchema accepts a null caption and keeps it null', () => {
  const result = updateIllustrationSchema.safeParse({ caption: null });

  assert.deepEqual(result.data, { caption: null });
});

test('updateIllustrationSchema accepts a caption at the limit', () => {
  const caption = 'x'.repeat(ILLUSTRATION_CAPTION_MAX_LENGTH);

  const result = updateIllustrationSchema.safeParse({ caption });

  assert.deepEqual(result.data, { caption });
});

test('updateIllustrationSchema rejects a caption one past the limit', () => {
  const result = updateIllustrationSchema.safeParse({
    caption: 'x'.repeat(ILLUSTRATION_CAPTION_MAX_LENGTH + 1),
  });

  assert.equal(result.success, false);
});

test('updateIllustrationSchema rejects unknown keys', () => {
  const result = updateIllustrationSchema.safeParse({
    caption: 'text',
    position: 3,
  });

  assert.equal(result.success, false);
});

test('updateIllustrationSchema rejects a body without a caption', () => {
  assert.equal(updateIllustrationSchema.safeParse({}).success, false);
  assert.equal(
    updateIllustrationSchema.safeParse({ caption: undefined }).success,
    false
  );
});

test('updateIllustrationSchema rejects a caption that is not a string', () => {
  assert.equal(
    updateIllustrationSchema.safeParse({ caption: 5 }).success,
    false
  );
});
