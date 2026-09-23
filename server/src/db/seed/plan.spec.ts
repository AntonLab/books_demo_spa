import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG_SEED, createRng } from './rng.ts';
import { buildPlan, type Plan } from './plan.ts';

// Everything about the plan except its dates, which are anchored to the moment
// of the run. Two runs from the same seed must agree on all of this; only the
// timestamps may move.
const shapeOf = (plan: Plan) => ({
  accounts: plan.accounts.map(({ spec }) => `${spec.login}:${spec.role}`),
  authors: plan.authors.map((author) => ({
    login: author.spec.login,
    series: author.series.map((entry) => entry.title),
    books: author.books.map((book) => ({
      title: book.title,
      status: book.status,
      seriesIndex: book.seriesIndex,
      coAuthorLogins: book.coAuthorLogins,
      chapters: book.chapters.map((chapter) => chapter.title),
    })),
  })),
  comments: plan.comments.map((comment) => comment.text),
  tombstones: plan.tombstones.size,
  likes: plan.likes.length,
});

const loginOf = (plan: Plan, accountIndex: number): string => {
  const account = plan.accounts[accountIndex];
  assert.ok(account, `no account at index ${accountIndex}`);
  return account.spec.login;
};

test('the same seed plans the same demo, down to every chapter title', () => {
  assert.deepEqual(
    shapeOf(buildPlan(createRng(RNG_SEED))),
    shapeOf(buildPlan(createRng(RNG_SEED)))
  );
});

test('plans the ten personas the demo is signed in as', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const roles = plan.accounts.map(({ spec }) => spec.role);

  assert.equal(plan.accounts.length, 10);
  assert.equal(roles.filter((role) => role === 'superadmin').length, 1);
  assert.equal(roles.filter((role) => role === 'admin').length, 1);
  assert.equal(roles.filter((role) => role === 'author').length, 3);
  assert.equal(roles.filter((role) => role === 'user').length, 5);
  assert.equal(new Set(plan.accounts.map(({ spec }) => spec.login)).size, 10);
});

test('gives every author a catalogue whose newest book is its only draft', () => {
  const plan = buildPlan(createRng(RNG_SEED));

  assert.equal(plan.authors.length, 3);
  for (const author of plan.authors) {
    assert.ok(author.series.length >= 1 && author.series.length <= 2);
    // 1-2 series of 4-5 books, plus 1-3 standalone.
    assert.ok(author.books.length >= 5 && author.books.length <= 13);

    const drafts = author.books.filter((book) => book.status === 'draft');
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0], author.books.at(-1));

    for (const book of author.books) {
      assert.ok(
        book.chapters.length >= 20 && book.chapters.length <= 24,
        `${book.title} has ${String(book.chapters.length)} chapters`
      );
    }
  }
});

test('writes no comment or like the API would refuse', () => {
  const plan = buildPlan(createRng(RNG_SEED));

  for (const comment of plan.comments) {
    assert.notEqual(comment.book.status, 'draft');
  }

  for (const like of plan.likes) {
    // Exactly one target, which is what models/Like.ts exists to enforce.
    assert.equal(Number(like.book !== null) + Number(like.comment !== null), 1);

    if (like.book !== null) {
      assert.notEqual(like.book.status, 'draft');
      // No Co-author likes their own book.
      assert.ok(
        !like.book.coAuthorLogins.includes(loginOf(plan, like.accountIndex))
      );
    }
    if (like.comment !== null) {
      assert.notEqual(like.comment.book.status, 'draft');
      // No author likes their own comment, and nothing likes a tombstone.
      assert.notEqual(like.comment.accountIndex, like.accountIndex);
      assert.ok(!plan.tombstones.has(like.comment));
    }
  }
});

test('dates nothing before it could have happened, and only tombstones a comment with a reply', () => {
  const plan = buildPlan(createRng(RNG_SEED));

  for (const comment of plan.comments) {
    const account = plan.accounts[comment.accountIndex];
    assert.ok(account, 'every comment has an account');
    assert.ok(comment.createdAt >= account.createdAt);
    if (comment.parent !== null) {
      assert.ok(comment.createdAt >= comment.parent.createdAt);
      assert.equal(comment.depth, comment.parent.depth + 1);
    }
    assert.ok(comment.depth <= 2);
  }

  for (const tombstoned of plan.tombstones.keys()) {
    assert.ok(
      plan.comments.some((comment) => comment.parent === tombstoned),
      'a tombstone only earns its place by keeping replies in their thread'
    );
  }
});
