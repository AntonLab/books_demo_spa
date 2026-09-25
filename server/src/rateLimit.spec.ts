import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, type RateLimiter } from './rateLimit.ts';

const WINDOW_MS = 1_000;

// Three hits a second, with Date and the sweep's interval mocked from 0. The
// interval is stopped when the test ends.
function limiterOn(t: TestContext): RateLimiter {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
  const limiter = createRateLimiter({ limit: 3, windowMs: WINDOW_MS });
  t.after(() => limiter.stop());
  return limiter;
}

// `clock.now = ms` moves the mocked Date by hand, firing no timer.
const clockOn = (t: TestContext) => ({
  set now(ms: number) {
    t.mock.timers.setTime(ms);
  },
});

test('lets `limit` hits through in a window and refuses the next', (t) => {
  const limiter = limiterOn(t);

  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.hit('a').allowed),
    [true, true, true, false]
  );
});

test('retryAfterMs is the time left in the window', (t) => {
  const limiter = limiterOn(t);
  const clock = clockOn(t);

  assert.equal(limiter.hit('a').retryAfterMs, WINDOW_MS);
  clock.now = 400;
  assert.equal(limiter.hit('a').retryAfterMs, 600);
});

test('the window ends on time, and the key starts again with a full budget', (t) => {
  const limiter = limiterOn(t);
  const clock = clockOn(t);
  for (let hit = 0; hit < 4; hit += 1) {
    limiter.hit('a');
  }

  clock.now = WINDOW_MS - 1;
  assert.equal(limiter.hit('a').allowed, false);
  clock.now = WINDOW_MS;
  assert.deepEqual(limiter.hit('a'), {
    allowed: true,
    retryAfterMs: WINDOW_MS,
  });
});

test('release decrements the key’s count, freeing the slot for another hit', (t) => {
  const limiter = limiterOn(t);
  // Three of three spent: a fourth would be refused, so releasing one must
  // free exactly one slot back, not merely avoid refusing the very next hit.
  for (let hit = 0; hit < 3; hit += 1) {
    limiter.hit('a');
  }

  limiter.release('a');

  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, false);
});

test('release never takes the count below zero', (t) => {
  const limiter = limiterOn(t);
  limiter.hit('a');

  for (let extra = 0; extra < 5; extra += 1) {
    limiter.release('a');
  }

  // Floored at 0, not negative: exactly `limit` hits are allowed from here,
  // not `limit` plus however far release over-shot below zero.
  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.hit('a').allowed),
    [true, true, true, false]
  );
});

test('release forgets the key once its count reaches zero, rather than leaving an empty window in the map', (t) => {
  const limiter = limiterOn(t);
  limiter.hit('a');

  limiter.release('a');

  assert.equal(limiter.size(), 0);
});

test('release does nothing when the key has no open window', (t) => {
  const limiter = limiterOn(t);
  const clock = clockOn(t);

  limiter.release('never-hit');
  assert.equal(limiter.size(), 0);

  // An expired window counts as none: releasing it neither revives it nor
  // leaves anything behind.
  limiter.hit('a');
  clock.now = WINDOW_MS;
  limiter.release('a');
  assert.equal(limiter.size(), 0);
});

test('release does not move the window’s end', (t) => {
  const limiter = limiterOn(t);
  const clock = clockOn(t);
  // Two hits, so the released count (1) stays above zero and the window
  // stays open — release deletes the key outright once it reaches zero,
  // which would make "the window's end" meaningless to ask about.
  limiter.hit('a');
  limiter.hit('a');

  clock.now = 400;
  limiter.release('a');

  assert.equal(limiter.hit('a').retryAfterMs, 600);
});

test('reset forgets one key and leaves the others alone', (t) => {
  const limiter = limiterOn(t);
  for (let hit = 0; hit < 3; hit += 1) {
    limiter.hit('a');
    limiter.hit('b');
  }

  limiter.reset('a');

  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('b').allowed, false);
});

test('each key is counted apart', (t) => {
  const limiter = limiterOn(t);
  for (let hit = 0; hit < 3; hit += 1) {
    limiter.hit('a');
  }

  assert.equal(limiter.hit('a').allowed, false);
  assert.equal(limiter.hit('b').allowed, true);
});

test('the sweep drops windows whose keys are never touched again', (t) => {
  const limiter = limiterOn(t);
  const clock = clockOn(t);
  limiter.hit('a');
  limiter.hit('b');
  clock.now = 500;
  limiter.hit('c');
  assert.equal(limiter.size(), 3);

  // On to 1000, where the sweep's first interval fires.
  t.mock.timers.tick(WINDOW_MS - 500);

  // a and b ended at 1000; c's window runs to 1500.
  assert.equal(limiter.size(), 1);
});

test('stop ends the sweep', (t) => {
  const limiter = limiterOn(t);
  limiter.hit('a');

  limiter.stop();
  t.mock.timers.tick(WINDOW_MS);

  assert.equal(limiter.size(), 1);
});
