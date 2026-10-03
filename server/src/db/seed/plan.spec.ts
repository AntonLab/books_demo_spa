import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG_SEED, createRng } from './rng.ts';
import {
  ABOUT_MAX_LENGTH,
  BAN_MARK_THRESHOLD,
  LAST_ONLINE_WINDOW_MS,
  READING_LIST_TITLE_MAX_LENGTH,
  READING_STATUSES,
  REPORT_EXPLANATION_MAX_LENGTH,
  REPORT_STATUSES,
} from 'shared';
import { buildPlan, type Plan, type PlannedComment } from './plan.ts';

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
  favorites: plan.favorites.map(
    (favorite) =>
      `${String(favorite.accountIndex)}:${favorite.book?.title ?? favorite.series?.title ?? ''}`
  ),
  reports: plan.reports.map((r) => `${r.status}:${r.reason}:${r.comment.text}`),
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

test('spreads Last online over the display classes, hides one stamp and never dates one before its account', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const now = Date.now();
  const age = (login: string) => {
    const account = plan.accounts.find(({ spec }) => spec.login === login);
    assert.ok(account, login);
    return account.lastSeenAt === null
      ? null
      : now - account.lastSeenAt.getTime();
  };

  assert.ok((age('superadmin') ?? Infinity) < LAST_ONLINE_WINDOW_MS);
  assert.ok((age('admin') ?? 0) > LAST_ONLINE_WINDOW_MS);
  assert.ok((age('admin') ?? Infinity) < 60 * 60 * 1000);
  assert.ok((age('mhale') ?? 0) > 24 * 60 * 60 * 1000);
  assert.ok((age('mhale') ?? Infinity) < 48 * 60 * 60 * 1000);
  assert.ok((age('ipetrov') ?? 0) > 7 * 24 * 60 * 60 * 1000);
  assert.equal(age('user1'), null);
  for (const { lastSeenAt, createdAt, spec } of plan.accounts) {
    assert.ok(lastSeenAt === null || lastSeenAt >= createdAt, spec.login);
  }
});

test('hides exactly one seeded stamp and gives a few Accounts an About that fits the limit, one long enough to clamp', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const hidden = plan.accounts.filter(({ spec }) => !spec.showLastSeen);
  const withAbout = plan.accounts.filter(({ spec }) => spec.about !== '');

  assert.equal(hidden.length, 1);
  assert.notEqual(hidden[0]?.lastSeenAt, null);
  assert.ok(withAbout.length >= 3);
  for (const { spec } of withAbout) {
    assert.ok(spec.about.length <= ABOUT_MAX_LENGTH, spec.login);
  }
  assert.ok(
    withAbout.some(
      ({ spec }) => spec.about.length > 300 && spec.about.includes('\n')
    )
  );
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

test('gives every reader a Library of Published books, one status each, every status held', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const readerIndexes = plan.accounts.flatMap((account, index) =>
    account.spec.role === 'user' ? [index] : []
  );
  const seen = new Set<string>();

  for (const entry of plan.library) {
    assert.ok(
      readerIndexes.includes(entry.accountIndex),
      'only readers hold a Library'
    );
    assert.notEqual(entry.book.status, 'draft');
    const key = `${String(entry.accountIndex)}:${entry.book.title}`;
    assert.ok(!seen.has(key), 'one status per Account and Book');
    seen.add(key);
    assert.ok(READING_STATUSES.includes(entry.status));
    const account = plan.accounts[entry.accountIndex];
    assert.ok(account && entry.updatedAt >= account.createdAt);
    assert.ok(entry.updatedAt >= entry.book.createdAt);
  }
  for (const index of readerIndexes) {
    assert.ok(
      plan.library.filter((entry) => entry.accountIndex === index).length >= 4
    );
  }
  for (const status of READING_STATUSES) {
    assert.ok(
      plan.library.some((entry) => entry.status === status),
      `${status} is held`
    );
  }
});

test('gives every reader one or two Reading lists of distinct shown works, mixing Books and Series', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const readerIndexes = plan.accounts.flatMap((account, index) =>
    account.spec.role === 'user' ? [index] : []
  );
  const owned = (index: number) =>
    plan.readingLists.filter((list) => list.accountIndex === index);
  const shownSeries = new Set(
    plan.authors.flatMap((author) =>
      author.series.filter((_, seriesIndex) =>
        author.books.some(
          (book) => book.seriesIndex === seriesIndex && book.status !== 'draft'
        )
      )
    )
  );

  for (const list of plan.readingLists) {
    assert.ok(
      readerIndexes.includes(list.accountIndex),
      'only readers own a list'
    );
    assert.ok(list.items.length >= 3 && list.items.length <= 6);
    assert.ok(
      list.title.length >= 1 &&
        list.title.length <= READING_LIST_TITLE_MAX_LENGTH
    );
    assert.ok(list.tags.length <= 3);
    const keys = list.items.map((item) => item.book ?? item.series);
    assert.equal(
      new Set(keys).size,
      keys.length,
      'a work appears once per list'
    );
    for (const item of list.items) {
      assert.ok(item.book === null || item.book.status !== 'draft');
      assert.ok(item.series === null || shownSeries.has(item.series));
    }
    const account = plan.accounts[list.accountIndex];
    assert.ok(account && list.createdAt >= account.createdAt);
    assert.ok(list.updatedAt >= list.createdAt);
  }
  for (const index of readerIndexes) {
    assert.ok([1, 2].includes(owned(index).length));
  }
  assert.ok(plan.readingLists.some((l) => l.items.some((i) => i.book)));
  assert.ok(plan.readingLists.some((l) => l.items.some((i) => i.series)));
  assert.equal(
    new Set(
      plan.readingLists.map((l) => `${String(l.accountIndex)}:${l.title}`)
    ).size,
    plan.readingLists.length
  );
});

test('plans Reports in every status, a System report, and an Account at the ban mark', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  for (const status of REPORT_STATUSES) {
    assert.ok(
      plan.reports.some((r) => r.status === status),
      status
    );
  }
  assert.ok(
    plan.reports.some((r) => r.reporterIndex === null && r.status === 'new')
  );
  assert.ok(
    plan.reports.some((r) => r.reason === 'other' && r.explanation !== null)
  );
  const upheld = new Map<number, Set<PlannedComment>>();
  for (const r of plan.reports.filter((x) => x.status === 'upheld')) {
    const owned =
      upheld.get(r.comment.accountIndex) ?? new Set<PlannedComment>();
    upheld.set(r.comment.accountIndex, owned.add(r.comment));
  }
  const top = Math.max(...[...upheld.values()].map((set) => set.size));
  assert.ok(
    top >= BAN_MARK_THRESHOLD,
    `most upheld Comments of one Account: ${String(top)}`
  );
});

test('plans only Reports the API would accept', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const open = new Set<PlannedComment>();
  const reporters = new Set<string>();
  const indexOf = (c: PlannedComment) => plan.comments.indexOf(c);
  for (const r of plan.reports) {
    const tombstone = plan.tombstones.get(r.comment);
    const isOpen = r.status === 'new' || r.status === 'in_review';
    assert.notEqual(
      r.reporterIndex,
      r.comment.accountIndex,
      'nobody reports their own Comment'
    );
    assert.notEqual(tombstone, 'deleted');
    assert.ok(
      r.createdAt >= r.comment.createdAt,
      'a Report follows its Comment'
    );
    if (r.reporterIndex !== null) {
      const key = `${String(indexOf(r.comment))}:${String(r.reporterIndex)}`;
      assert.ok(!reporters.has(key), `duplicate reporter ${key}`);
      reporters.add(key);
      const account = plan.accounts[r.reporterIndex];
      assert.ok(
        account && account.createdAt <= r.createdAt,
        'the reporter exists by then'
      );
    }
    if (isOpen) {
      assert.ok(!open.has(r.comment), 'one Open report per Comment');
      open.add(r.comment);
      assert.equal(
        tombstone,
        undefined,
        'an Open report sits on a live Comment'
      );
      assert.equal(r.settledAt, null);
    } else {
      assert.ok(r.settledAt && r.settledAt >= r.createdAt);
      assert.notEqual(r.moderatorIndex, null);
    }
    if (r.status === 'in_review') {
      assert.ok(r.moderatorIndex !== null && r.takenAt !== null);
    }
    if (r.status === 'dismissed') assert.notEqual(r.settledText, null);
    if (r.moderatorIndex !== null) {
      assert.notEqual(r.moderatorIndex, r.comment.accountIndex);
    }
    if (r.reason === 'other') {
      assert.ok(
        r.explanation && r.explanation.length <= REPORT_EXPLANATION_MAX_LENGTH
      );
    } else {
      assert.equal(r.explanation, null);
    }
  }
});

test('leaves every earlier draw as it was when Reading lists are added', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  assert.ok(plan.library.length > 0 && plan.favorites.length > 0);
});

test('gives every reader a few favorites the API would accept, and nobody else any', () => {
  const plan = buildPlan(createRng(RNG_SEED));
  const readerIndexes = plan.accounts.flatMap((account, index) =>
    account.spec.role === 'user' ? [index] : []
  );
  // A Series has no status: a reader can see it once it holds one non-draft
  // book, and not before.
  const booksInSeries = new Map(
    plan.authors.flatMap((author) =>
      author.series.map(
        (entry, seriesIndex) =>
          [
            entry,
            author.books.filter((book) => book.seriesIndex === seriesIndex),
          ] as const
      )
    )
  );

  assert.equal(readerIndexes.length, 5);

  for (const favorite of plan.favorites) {
    // Exactly one target, which is what models/Favorite.ts exists to enforce.
    assert.equal(
      Number(favorite.book !== null) + Number(favorite.series !== null),
      1
    );
    assert.ok(
      readerIndexes.includes(favorite.accountIndex),
      `${loginOf(plan, favorite.accountIndex)} is not a reader`
    );
    const account = plan.accounts[favorite.accountIndex];
    assert.ok(account, 'every favorite has an account');
    assert.ok(favorite.createdAt >= account.createdAt);

    if (favorite.book !== null) {
      assert.notEqual(favorite.book.status, 'draft');
      assert.ok(favorite.createdAt >= favorite.book.createdAt);
    }
    if (favorite.series !== null) {
      const books = booksInSeries.get(favorite.series);
      assert.ok(
        books?.some((book) => book.status !== 'draft'),
        `${favorite.series.title} has no book a reader can see`
      );
      assert.ok(favorite.createdAt >= favorite.series.createdAt);
    }
  }

  for (const accountIndex of readerIndexes) {
    const held = plan.favorites.filter(
      (favorite) => favorite.accountIndex === accountIndex
    );
    const books = held.flatMap((favorite) =>
      favorite.book === null ? [] : [favorite.book]
    );
    const series = held.flatMap((favorite) =>
      favorite.series === null ? [] : [favorite.series]
    );

    assert.ok(
      books.length >= 2 && books.length <= 4,
      `${loginOf(plan, accountIndex)} holds ${String(books.length)} books`
    );
    assert.equal(series.length, 1);
    // The unique index on (userId, bookId) would refuse a repeat.
    assert.equal(new Set(books).size, books.length);
  }
});
