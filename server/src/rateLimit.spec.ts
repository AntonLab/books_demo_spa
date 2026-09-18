import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, type RateLimiter } from './rateLimit.ts';

const WINDOW_MS = 1_000;

interface Clock {
  now: number;
}

// Three hits a second, on a clock the test moves by hand. The sweep's
// interval is stopped when the test ends.
function limiterOn(t: TestContext, clock: Clock): RateLimiter {
  const limiter = createRateLimiter({
    limit: 3,
    windowMs: WINDOW_MS,
    now: () => clock.now,
  });
  t.after(() => limiter.stop());
  return limiter;
}

test('lets `limit` hits through in a window and refuses the next', (t) => {
  const limiter = limiterOn(t, { now: 0 });

  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.hit('a').allowed),
    [true, true, true, false]
  );
});

test('peek counts nothing, and says whether one more hit would pass', (t) => {
  const limiter = limiterOn(t, { now: 0 });

  for (let look = 0; look < 10; look += 1) {
    assert.equal(limiter.peek('a').allowed, true);
  }
  limiter.hit('a');
  limiter.hit('a');
  assert.equal(limiter.peek('a').allowed, true);
  limiter.hit('a');
  assert.equal(limiter.peek('a').allowed, false);
});

test('retryAfterMs is the time left in the window, and 0 without one', (t) => {
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);

  assert.equal(limiter.peek('a').retryAfterMs, 0);
  limiter.hit('a');
  clock.now = 400;
  assert.equal(limiter.peek('a').retryAfterMs, 600);
  assert.equal(limiter.hit('a').retryAfterMs, 600);
});

test('the window ends on time, and the key starts again with a full budget', (t) => {
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);
  for (let hit = 0; hit < 4; hit += 1) {
    limiter.hit('a');
  }

  clock.now = WINDOW_MS - 1;
  assert.equal(limiter.peek('a').allowed, false);
  clock.now = WINDOW_MS;
  assert.deepEqual(limiter.peek('a'), { allowed: true, retryAfterMs: 0 });
  // Touching the expired key dropped its window.
  assert.equal(limiter.size(), 0);
});

test('release decrements the key’s count, freeing the slot for another hit', (t) => {
  const limiter = limiterOn(t, { now: 0 });
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
  const limiter = limiterOn(t, { now: 0 });
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

test('release does nothing when the key has no open window', (t) => {
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);

  limiter.release('never-hit');
  assert.deepEqual(limiter.peek('never-hit'), {
    allowed: true,
    retryAfterMs: 0,
  });
  assert.equal(limiter.size(), 0);

  // An expired window counts as none: releasing it neither revives it nor
  // leaves anything behind.
  limiter.hit('a');
  clock.now = WINDOW_MS;
  limiter.release('a');
  assert.equal(limiter.size(), 0);
});

test('release does not move the window’s end', (t) => {
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);
  limiter.hit('a');

  clock.now = 400;
  limiter.release('a');

  assert.equal(limiter.peek('a').retryAfterMs, 600);
});

test('reset forgets one key and leaves the others alone', (t) => {
  const limiter = limiterOn(t, { now: 0 });
  for (let hit = 0; hit < 3; hit += 1) {
    limiter.hit('a');
    limiter.hit('b');
  }

  limiter.reset('a');

  assert.equal(limiter.peek('a').allowed, true);
  assert.equal(limiter.peek('b').allowed, false);
});

test('each key is counted apart', (t) => {
  const limiter = limiterOn(t, { now: 0 });
  for (let hit = 0; hit < 3; hit += 1) {
    limiter.hit('a');
  }

  assert.equal(limiter.hit('a').allowed, false);
  assert.equal(limiter.hit('b').allowed, true);
});

test('the sweep drops windows whose keys are never touched again', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);
  limiter.hit('a');
  limiter.hit('b');
  clock.now = 500;
  limiter.hit('c');
  assert.equal(limiter.size(), 3);

  clock.now = WINDOW_MS;
  t.mock.timers.tick(WINDOW_MS);

  // a and b ended at 1000; c's window runs to 1500.
  assert.equal(limiter.size(), 1);
});

test('stop ends the sweep', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clock = { now: 0 };
  const limiter = limiterOn(t, clock);
  limiter.hit('a');

  limiter.stop();
  clock.now = WINDOW_MS;
  t.mock.timers.tick(WINDOW_MS);

  assert.equal(limiter.size(), 1);
});
